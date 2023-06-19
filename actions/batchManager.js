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
const Batch = require('./batch');
const appConfig = require('./appConfig');
const { getAioLogger } = require('./utils');

const logger = getAioLogger();

/**
 * The BatchManager class helps manage a collection of batches for a single process. Its functions include:
 * 1. Create batches based on the number of batch files configuration.
 * 2. Maintain a manifest file for the collection of batches,
 *    which includes details such as the last batch and associated activation IDs.
 * 3. Track the current batch in the manager and provide helper methods for management.
 * 4. Offer cleanup functions for managing any necessary cleanup tasks.
 * Some near term tasks to be done
 * 1. Clean of processed files needs to be handled instead of full cleanup
 * 2. Stop and resume needs to be implemented.
 * 3. Retry of failed files needs to be implemented which might need rebatching
 * 4. The execution/triggering of action is out of this (i.e. promoteBatch).
 *   There needs to be enhacement to handle this within this e.g. Batch execution stargergy should be implemented.
 */
class BatchManager {
    /**
     * Initializes the batch manager based on the action and sets up manifest files.
     * Default files in batch is 1000 and filePath is generate based on configuration and action
     * @param {*} params { action: <Key to be used for the batchManager>, fileSdk: <file store interface> }
     */
    constructor(params) {
        this.params = params || {};
        this.batches = [];
        this.action = params.action;
        this.filesSdk = params.filesSdk;
        this.filesSdkPath = `${appConfig.getBatchConfig()?.batchFilesPath}/${this.action}`;
        this.numBatchFiles = appConfig.getBatchConfig().numBatchFiles;
        this.manifestFile = `${this.filesSdkPath}/milo_batching_manifest.json`;
    }

    /** Cleanup files for the current action */
    async cleanupFiles() {
        await this.filesSdk.delete(`${this.filesSdkPath}/`);
    }

    /**
     * Returns the current running batch interface
     * @returns Batch which has details like battch number and batchPath
     */
    async getCurrentBatch() {
        if (!this.currentBatch) {
            this.currentBatch = this.createBatch();
        }
        return this.currentBatch;
    }

    /**
     * When the batches are created these are passed over to workers for processing.
     * The worker has only information of batch and this method helps to
     * build the battch manager from the batch information
     * @param {*} params Batch paramerter which includes fields used by the constructor
     * @returns BatchManager from the params
     */
    static getBatchManagerForBatch(params) {
        const batchManager = new BatchManager(params);
        batchManager.setupCurrentBatch(params);
        return batchManager;
    }

    /**
     * This method is used by the worker action which is processing a single batch.
     * Inorders to access interfacing this method helps to build the Batch and links with BatchManager
     * @param {*} params Batch paramerter which includes fields used by the constructor
     */
    setupCurrentBatch(params) {
        this.currentBatchNumber = params.batchNumber;
        this.currentBatch = new Batch({
            ...this.params,
            filesSdk: this.filesSdk,
            filesSdkPath: this.filesSdkPath,
            batchNumber: this.currentBatchNumber,
            numBatchFiles: this.numBatchFiles
        });
        this.batches.push(this.currentBatch);
    }

    /**
     * This method is used when a batch overflows and a new batch needs to be created.
     * This batch is also linked with BatchManager
     */
    async createBatch() {
        this.currentBatchNumber = this.getNewBatchNumber();
        this.currentBatch = new Batch({
            filesSdk: this.filesSdk,
            filesSdkPath: this.filesSdkPath,
            batchNumber: this.currentBatchNumber,
            numBatchFiles: this.numBatchFiles
        });
        this.batches.push(this.currentBatch);
        this.writeToManifest({ lastBatch: this.currentBatchNumber, dtls: {} });
    }

    /**
     * Overwrite details to manifest
     * @param {*} data {lastBatch: <final batch>, dtls:[{batchNunber: <batch number>,
     * activationId: <AIO action activation id>}]}
     */
    async writeToManifest(data) {
        await this.filesSdk.write(this.manifestFile, JSON.stringify(data));
    }

    /**
     * Append to manifest file. The writeToManifest and this can be merged. Can be looked later.
     * @param {*} params data similar to that of writeToManifest
     */
    async addToManifest(params) {
        const mfc = await this.getManifestContent();
        mfc.dtls = { ...mfc.dtls, ...params };
        await this.writeToManifest(mfc);
    }

    /**
     * The file content of manifest files
     * @returns File content of manifest file.
     */
    async getManifestContent() {
        const buffer = await this.filesSdk.read(this.manifestFile);
        const data = buffer.toString();
        logger.log(`Manifest file content ${data}`);
        return JSON.parse(buffer.toString());
    }

    /**
     * Current batch number else 0
     * @returns current batch number else 0
     */
    getNewBatchNumber() {
        return (this.currentBatch?.getBatchNumber() || 0) + 1;
    }

    /**
     * This adds the files metadata to Batch and create a new if it overflows
     * @param {*} file  File path
     * @param {*} retryCount after an overflow a new batch is created and this is called again.
     */
    async addFile(file, retryCount) {
        if (this.filesSdk && this.filesSdkPath) {
            if (this.currentBatch && this.currentBatch.canAddFile()) {
                await this.currentBatch.addFile(file);
            } else if (!retryCount) {
                await this.currentBatch?.savePendingFiles();
                await this.createBatch();
                await this.addFile(file, 1);
            }
        }
    }

    async saveRemainig() {
        this.currentBatch?.savePendingFiles();
    }

    /**
     * @returns Return batches linked to BatchManager
     */
    getBatches() {
        return this.batches;
    }

    /**
     * Write data to current processing batch. Used by worker
     * @param {*} data Custom data that needs to be store in manifest other than batch number
     */
    async writeToCurrentBatchManifest(data) {
        await this.currentBatch?.writeToManifest(data);
    }

    /**
     * @returns Current batch manifest content.
     */
    async getCurrentBatchManifestContent() {
        const data = await this.currentBatch?.getManifestContent();
        return data;
    }
}

module.exports = BatchManager;
