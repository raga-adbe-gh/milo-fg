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
const { getAioLogger } = require('../utils');
const filesLib = require('@adobe/aio-lib-files');

const ENABLE = true;

// Maintainance functions
async function main(args) {
    const logger = getAioLogger();
    let payload;
    try {
        if (ENABLE) throw new Error('Permission Denied');
        const { deletetFilePath, listFilePath } = args;
        const filesSdk = await filesLib.init();
        const maintAction = new MaintAction();
        maintAction.setFilesSdk(filesSdk);
        if (deletetFilePath) payload.deleteStatus = await maintAction.deleteFiles(deletetFilePath);
        if (listFilePath) payload.deleteStatus = await maintAction.listFiles(deletetFilePath);
    } catch (err) {
        logger.error(err);
        payload = err;
    }

    return {
        payload,
    };
}

class MaintAction {
    setFilesSdk(filesSdk) {
        this.filesSdk = filesSdk;
        return this;
    }

    async deleteFiles(filePath) {
        // e.g file - /milo-floodgate/batching/promoteAction/batch_2/bfile_901.json
        // pass promoteAction/batch_2/bfile_901.json
        return this.filesSdk.delete(`${this.filesSdkPath}/${filePath}`);
    }

    async listFiles(filePath) {
        return this.filesSdk.list(`${this.filesSdkPath}/${filePath}`);
    }
}

exports.main = main;
