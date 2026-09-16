import * as fs from 'fs';
import * as core from '@actions/core';
const openapiDiff = require('openapi-diff');

async function runSentinel() {
  try {
    const baseFile = core.getInput('base-spec') || process.env.BASE_SPEC || 'fixtures/base.json';
    const headFile = core.getInput('head-spec') || process.env.HEAD_SPEC || 'fixtures/broken.json';

    core.info(`🔍 Comparing specs: ${baseFile} -> ${headFile}`);

    if (!fs.existsSync(baseFile)) {
      throw new Error(`Base spec not found at: ${baseFile}`);
    }
    if (!fs.existsSync(headFile)) {
      throw new Error(`Head spec not found at: ${headFile}`);
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

    if (diffResult.breakingDifferencesFound) {
      let message = '🚨 **API Drift Sentinel: Breaking Changes Detected!**\n\n';
      message += `| Action | Code | Location |\n`;
      message += `| :----- | :--- | :------- |\n`;

      for (const item of diffResult.breakingDifferences) {
        const location = item.sourceSpecEntityDetails?.[0]?.location || 'unknown';
        message += `| ${item.action.toUpperCase()} | \`${item.code}\` | \`${location}\` |\n`;
      }

      message += '\n❌ **PR merge blocked.** Please resolve or version breaking changes.';

      core.setFailed(message);
    } else {
      core.info('✅ No breaking API changes detected. CI gate passed!');
    }
  } catch (error: any) {
    core.setFailed(`Sentinel execution error: ${error.message}`);
  }
}

runSentinel();
