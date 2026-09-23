import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
// @ts-ignore
import openapiDiff from 'openapi-diff';

const COMMENT_TAG = '<!-- api-drift-sentinel-comment -->';

async function postOrUpdatePRComment(token: string, body: string) {
  const context = github.context;
  const prNumber = context.payload.pull_request?.number;
  if (!prNumber) {
    core.info('Not running in a pull_request event context; skipping PR comment.');
    return;
  }

  const octokit = github.getOctokit(token);
  const { owner, repo } = context.repo;

  try {
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
    });

    const existingComment = comments.find((c) => c.body?.includes(COMMENT_TAG));
    const fullBody = `${COMMENT_TAG}\n${body}`;

    if (existingComment) {
      core.info(`Updating existing Sentinel PR comment (ID: ${existingComment.id})...`);
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingComment.id,
        body: fullBody,
      });
    } else {
      core.info('Posting new Sentinel PR comment...');
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: fullBody,
      });
    }
  } catch (err: any) {
    core.warning(`Failed to post PR comment: ${err.message}`);
  }
}

async function reportToSentinelCloud(endpoint: string, token: string, payload: any) {
  try {
    core.info(`Sending contract event to Sentinel Cloud (${endpoint})...`);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'api-drift-sentinel-action',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      core.warning(`Sentinel Cloud returned status ${res.status}: ${await res.text()}`);
    } else {
      core.info('Successfully recorded event in Sentinel Cloud.');
    }
  } catch (err: any) {
    core.warning(`Sentinel Cloud ingestion error: ${err.message}`);
  }
}

async function runSentinel() {
  try {
    const baseFile = core.getInput('base-spec', { required: true });
    const headFile = core.getInput('head-spec', { required: true });
    const githubToken = core.getInput('github-token');
    const sentinelToken = core.getInput('sentinel-token');
    const sentinelEndpoint = core.getInput('sentinel-endpoint') || 'https://api.drift-sentinel.com/api/v1/events';

    if (!fs.existsSync(baseFile)) {
      throw new Error(`Base spec file not found: ${baseFile}`);
    }
    if (!fs.existsSync(headFile)) {
      throw new Error(`Head spec file not found: ${headFile}`);
    }

    const baseContent = fs.readFileSync(baseFile, 'utf8');
    const headContent = fs.readFileSync(headFile, 'utf8');

    const diffResult = await openapiDiff.diffSpecs({
      sourceSpec: {
        content: baseContent,
        location: baseFile,
        format: 'openapi3',
      },
      destinationSpec: {
        content: headContent,
        location: headFile,
        format: 'openapi3',
      },
    });

    const context = github.context;
    const payload = {
      repository: `${context.repo.owner}/${context.repo.repo}`,
      branch: context.ref,
      commitSha: context.sha,
      prNumber: context.payload.pull_request?.number || null,
      breaking: diffResult.breakingDifferencesFound,
      breakingCount: diffResult.breakingDifferences?.length || 0,
      differences: diffResult.breakingDifferences || [],
      timestamp: new Date().toISOString(),
    };

    if (diffResult.breakingDifferencesFound) {
      let message = '🚨 **API Drift Sentinel: Breaking Changes Detected!**\n\n';
      message += '| Action | Code | Location |\n';
      message += '| :----- | :--- | :------- |\n';

      for (const item of diffResult.breakingDifferences) {
        const location = item.sourceSpecEntityDetails?.[0]?.location || 'unknown';
        message += `| ${item.action.toUpperCase()} | \`${item.code}\` | \`${location}\` |\n`;
      }

      message += '\n❌ **PR merge blocked.** Please resolve or version breaking changes.';

      if (githubToken) {
        await postOrUpdatePRComment(githubToken, message);
      }

      if (sentinelToken) {
        await reportToSentinelCloud(sentinelEndpoint, sentinelToken, payload);
      }

      core.setFailed(message);
    } else {
      if (sentinelToken) {
        await reportToSentinelCloud(sentinelEndpoint, sentinelToken, payload);
      }
      core.info('✅ No breaking API changes detected. CI gate passed!');
    }
  } catch (error: any) {
    core.setFailed(`Sentinel execution error: ${error.message}`);
  }
}

runSentinel();
