/* ************************************************************************
* ADOBE CONFIDENTIAL
* ___________________
*
* Copyright 2023 Adobe
* All Rights Reserved.
*
* NOTICE: All information contained herein is, and remains
* the property of Adobe and its suppliers, if any. The intellectual
* and technical concepts contained herein are proprietary to Adobe
* and its suppliers and are protected by all applicable intellectual
* property laws, including trade secret and copyright laws.
* Dissemination of this information or reproduction of this material
* is strictly forbidden unless prior written permission is obtained
* from Adobe.
************************************************************************* */

// eslint-disable-next-line import/no-extraneous-dependencies
const openwhisk = require('openwhisk');
const filesLib = require('@adobe/aio-lib-files');
const { getAioLogger, PROMOTE_ACTION } = require('../utils');
const AppConfig = require('../appConfig');
const SharepointAuth = require('../sharepointAuth');
const FgStatus = require('../fgStatus');
const FgUser = require('../fgUser');

const logger = getAioLogger();
const TRACKER_RULE = 'everyMinRule';

// Maintainance functions
async function main(args) {
    const ow = openwhisk();
    const payload = {};
    try {
        const params = {
            deleteFilePath: args.deleteFilePath,
            listFilePath: args.listFilePath,
            dataFile: args.dataFile,
            stateStoreKey: args.stateStoreKey,
            clearStateStore: args.clearStateStore,
            tracker: args.tracker,
        };
        const appConfig = new AppConfig(args);
        const filesSdk = await filesLib.init();
        const fgUser = new FgUser({ at: args.spToken, appConfig });
        const maintAction = new MaintAction(appConfig);
        maintAction.setFilesSdk(filesSdk);

        // Admin function
        payload.permissions = {
            isAdmin: await fgUser.isAdmin(),
            isUser: await fgUser.isUser(),
        };

        if (!(payload.permissions.isAdmin || payload.permissions.isUser)) {
            payload.error = 'Could not determine the user.';
            logger.error(payload);
            return {
                payload,
            };
        }
        const userDetails = new SharepointAuth(appConfig.getMsalConfig()).getUserDetails(args.spToken);

        logger.info(`maint action ${JSON.stringify(params)} by ${JSON.stringify(userDetails)}`);
        if (params.listFilePath !== undefined) payload.fileList = await maintAction.listFiles(params.listFilePath);
        if (params.dataFile !== undefined) payload.fileData = await maintAction.dataFile(params.dataFile);
        if (params.stateStoreKey !== undefined) payload.stateStore = await maintAction.stateStoreKey(params.stateStoreKey);
        if (payload.permissions?.isAdmin && params.deleteFilePath !== undefined) payload.deleteStatus = await maintAction.deleteFiles(params.deleteFilePath);
        if (payload.permissions?.isAdmin && params.clearStateStore !== undefined) payload.stateStore = (await maintAction.clearStateStore(params.clearStateStore));
        if (payload.permissions?.isAdmin && params.tracker !== undefined) payload.tracker = `Tracker enable=${params.tracker} ${(await maintAction.updateTracker({ enable: params.tracker }, ow))}`;
    } catch (err) {
        logger.error(err);
        payload.error = err;
    }

    return {
        payload,
    };
}

class MaintAction {
    constructor(appConfig) {
        this.appConfig = appConfig;
    }

    setFilesSdk(filesSdk) {
        this.filesSdk = filesSdk;
        this.filesSdkPath = this.appConfig.getBatchConfig().batchFilesPath;
        return this;
    }

    async deleteFiles(filePath) {
        // e.g file - /milo-floodgate/batching/promoteAction/batch_2/bfile_901.json
        // pass promoteAction/batch_2/bfile_901.json
        // For a complete cleanup use promoteAction/
        const deletePath = `${this.filesSdkPath}/${filePath || ''}`;
        logger.info(`Delete files from ${deletePath}`);
        return this.filesSdk.delete(deletePath);
    }

    async listFiles(filePath) {
        const searchPath = `${this.filesSdkPath}/${filePath || ''}/`;
        logger.info(`List files from ${searchPath}`);
        return this.filesSdk.list(searchPath);
    }

    async dataFile(dataFile) {
        const file = `${this.filesSdkPath}/${dataFile}`;
        logger.info(`Contents for data file ${file}`);
        // All files are json read the file
        let rawd; let jsond;
        try {
            rawd = await this.filesSdk.read(file);
            jsond = JSON.parse(rawd);
        } catch (err) {
            logger.info(`Error while reading/parsing ${file}`);
        }
        return jsond || rawd?.toString();
    }

    async stateStoreKey(key) {
        const fgStatus = new FgStatus(this.getActionStatusKey(key));
        const data = await fgStatus.getStatusFromStateLib();
        return data;
    }

    async clearStateStore(key) {
        const fgStatus = new FgStatus(this.getActionStatusKey(key));
        await fgStatus.clearState(true);
        return {};
    }

    getActionStatusKey(key) {
        // Split by comma (action, statusKey)
        let action = PROMOTE_ACTION;
        let statusKey;
        try {
            const mtchs = key.match(/(.*?),(.*)/);
            [, action, statusKey] = mtchs;
        } catch (err) {
            logger.error(`Could not parse ${key}`);
        }
        return { action, statusKey };
    }

    async updateTracker({ enable = '' }, ow) {
        if (enable.toLowerCase() === 'on') {
            return ow.rules.enable({ name: TRACKER_RULE });
        }
        if (enable.toLowerCase() === 'off') {
            return ow.rules.disable({ name: TRACKER_RULE });
        }
        return 'No Action';
    }
}

exports.main = main;
