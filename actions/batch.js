/* eslint-disable no-await-in-loop */
/* ***********************************************************************
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

const { getAioLogger } = require('./utils');

const logger = getAioLogger();

const NUM_BATCH_FILES = 10;
const FOLDER_PREFIX = 'batch';
const FILENAME_PREFIX = 'bfile';
const FILE_PATTERN = `/${FILENAME_PREFIX}[^/]*\\.json`;

/**
 * Holds the batch related information like the path where the batch specific files are stored
 * and file metadata for each file. A batch specific manifest file is also stored with
 * batch number/path along with additional details which can be used further.
 */
class Batch {
    /**
     * Uses the configruations for setting up the batch. Setsup the batch path and manifest file.
     */
    constructor(params) {
        this.params = params;
        this.filesSdk = params.filesSdk;
        this.filesSdkPath = params.filesSdkPath;
        this.batchNumber = params?.batchNumber || 1;
        this.numBatchFiles = params?.numBatchFiles || NUM_BATCH_FILES;
        this.batchPath = `${this.filesSdkPath}/${FOLDER_PREFIX}_${this.batchNumber}`;
        this.manifestFile = `${this.batchPath}/milo_batch_manifest.json`;
        this.numFiles = 0;
    }

    /**
     * @returns The current batch number assigned by batchmanager
     */
    getBatchNumber() {
        return this.batchNumber;
    }

    /**
     * @returns Batch path in filestore
     */
    getBatchPath() {
        return this.batchPath;
    }

    /**
     * @returns Checks if the file can be added based on threshold config
     */
    canAddFile() {
        return this.filesSdk && this.filesSdkPath && this.numFiles < this.numBatchFiles;
    }

    /**
     * @param {*} file Add the file metadata informationo to file store e.g. bfile_1.json..
     */
    async addFile(file) {
        if (this.filesSdk && this.filesSdkPath) {
            const batchFn = `${FILENAME_PREFIX}_${this.numFiles + 1}.json`;
            const filePath = `${this.batchPath}/${batchFn}`;
            const dataStr = JSON.stringify({ file, batchFn, batchNumber: this.batchNumber });
            logger.info(`Batch path write  ${filePath} with files ${dataStr}`);
            await this.filesSdk.write(filePath, dataStr);
            this.numFiles += 1;
        }
    }

    /**
     * @returns Files content stored in the files in the batch.
     */
    async getFiles() {
        logger.info(`get batch files ${this.filesSdk} and ${this.filesSdkPath}`);
        const fileContents = [];
        if (this.filesSdk && this.filesSdkPath) {
            const dirPath = `${this.batchPath}/`;
            const fileList = await this.filesSdk.list(dirPath);
            logger.info(`Batch getFiles ${dirPath} with files ${fileList.length}`);
            const rx = new RegExp(FILE_PATTERN);
            for (let i = 0; i < fileList.length; i += 1) {
                if (rx.test(fileList[i]?.name)) {
                    const dataStr = await this.filesSdk.read(fileList[i].name);
                    fileContents.push(JSON.parse(dataStr));
                }
            }
        }
        return fileContents;
    }

    /**
     * @param {*} data Writes to batch metadata e.g. failed previews.
     */
    async writeToManifest(data) {
        await this.filesSdk.write(this.manifestFile, JSON.stringify(data));
    }

    /**
     * @returns Get manifest file content e.g. json for updating status/reporting
     */
    async getManifestContent() {
        const buffer = await this.filesSdk.read(this.manifestFile);
        const data = buffer.toString();
        return JSON.parse(data);
    }
}

module.exports = Batch;
