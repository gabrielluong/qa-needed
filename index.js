const github = require("@actions/github");
const core = require('@actions/core');

/**
 * Returns a list of issue numbers from parsing the commits in the pull request.
 */
function getIssues(commits) {
  const issues = [];

  for (const { commit } of commits) {
    let issueRegExp = /Issue #(\d*)/;

    if (issueRegExp.test(commit.message)) {
      let match =  issueRegExp.exec(commit.message);
      let issueNumber = match[1];

      if (!issues.includes(issueNumber)) {
        issues.push(issueNumber);
      }
    }
  }

  return issues;
}

async function run() {
  try {
    const token = core.getInput("github-token");
    const octokit = new github.getOctokit(token);
    const payload = github.context.payload;
    const repo = payload.repository.name;
    const owner = payload.repository.owner.login;
    const pullRequestNumber = payload.number;

    if (pullRequestNumber === undefined) {
      core.warning("No pull request number in payload.");
      return;
    }

    const commits = await octokit.rest.pulls.listCommits({
      owner,
      repo,
      pull_number: pullRequestNumber,
    });

    const issues = getIssues(commits.data);

    if (!issues.length) {
      core.warning("No issue numbers found in commits.");
      return;
    }

    const pull = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullRequestNumber,
    });

    const checkRegExp = new RegExp(core.getInput("check-regexp"));
    let body = pull.data.body;

    if (body == null || !checkRegExp.test(body)) {
      core.warning("Check was not found.");
      return;
    }

    const match = checkRegExp.exec(body);
    const isChecked = match[1].toLowerCase() == "x";

    for (const issueNumber of issues) {
      const issue = await octokit.rest.issues.get({
        owner,
        repo,
        issue_number: issueNumber
      });
      let labels = issue.data.labels.map(label => label.name);
      const label = core.getInput("label");

      if ((isChecked && labels.includes(label)) ||
          (!isChecked && !labels.includes(label))
      ) {
        continue;
      } else if (!isChecked && labels.includes(label)) {
        labels = labels.filter(l => l != label);
      } else if (isChecked && !labels.includes(label)) {
        labels.push(label);
      }

      await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        labels
      });

      core.notice(`Added ${label} in #${issueNumber}.`);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
