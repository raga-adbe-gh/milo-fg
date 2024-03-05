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

const FOLDER_PREFIX = 'batch';
const BATCH_INFO_FILE = 'batch_info.json';
const RESULTS_FILE = 'results.json';

/**
 * Holds the batch related information like the path where the batch specific files are stored
 * and file metadata for each file. A batch specific manifest file is also stored with
 * batch number/path along with additional details which can be used further.
 */
class Batch {
    batchFiles = [];

    /**
     * Uses the configruations for setting up the batch. Setsup the batch path and manifest file.
     */
    constructor(params) {
        this.params = params;
        this.filesSdk = params.filesSdk;
        this.instancePath = params.instancePath;
        this.batchNumber = params?.batchNumber || 1;
        this.maxFilesPerBatch = params?.maxFilesPerBatch || 200;
        this.batchPath = `${this.instancePath}/${FOLDER_PREFIX}_${this.batchNumber}`;
        this.batchInfoFile = `${this.batchPath}/${BATCH_INFO_FILE}`;
        this.resultsFile = `${this.batchPath}/${RESULTS_FILE}`;
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
        return this.filesSdk && this.instancePath && this.batchFiles.length < this.maxFilesPerBatch;
    }

    /**
     * @param {*} file Add the file metadata informationo to file store e.g. bfile_1.json..
     */
    async addFile(file) {
        if (this.filesSdk && this.instancePath) {
            const data = { file, batchNumber: this.batchNumber };
            this.batchFiles.push(data);
        }
    }

    /**
     * Flush data to file
     */
    async savePendingFiles() {
        if (!this.filesSdk || !this.batchFiles?.length) return;
        const dataStr = JSON.stringify(this.batchFiles);
        await this.filesSdk.write(this.batchInfoFile, dataStr);
    }

    async getFiles() {
        logger.info(`get batch files ${this.filesSdk} and ${this.instancePath}`);
        let fileContents = [];
        if (this.filesSdk && this.instancePath) {
            const dataStr = await this.filesSdk.read(this.batchInfoFile);
            fileContents = JSON.parse(dataStr);
        }
        return fileContents;
    }

    /**
     * @param {*} data Writes to batch metadata e.g. failed previews.
     */
    async writeResults(data) {
        await this.filesSdk.write(this.resultsFile, JSON.stringify(data));
    }

    /**
     * @returns Get manifest file content e.g. json for updating status/reporting
     */
    async getResultsContent() {
        const fileProps = await this.filesSdk.list(this.resultsFile);
        if (fileProps && fileProps.length) {
            const buffer = await this.filesSdk.read(this.resultsFile);
            const data = buffer.toString();
            return JSON.parse(data);
        }
        return null;
    }
}

module.exports = Batch;
