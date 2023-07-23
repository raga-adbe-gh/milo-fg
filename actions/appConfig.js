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

const crypto = require('crypto');

class AppConfig {
    configMap = {};

    setAppConfig(params) {
        this.configMap.fgSite = params.fgSite;
        this.configMap.fgClientId = params.fgClientId;
        this.configMap.fgAuthority = params.fgAuthority;
        this.configMap.shareUrl = params.shareUrl;
        this.configMap.fgShareUrl = params.fgShareUrl;
        this.configMap.rootFolder = params.rootFolder;
        this.configMap.fgRootFolder = params.fgRootFolder;
        this.configMap.promoteIgnorePaths = params.promoteIgnorePaths || [];
        this.configMap.clientId = params.clientId;
        this.configMap.tenantId = params.tenantId;
        this.configMap.certPassword = params.certPassword;
        this.configMap.certKey = params.certKey;
        this.configMap.certThumbprint = params.certThumbprint;
        this.configMap.skipInProg = (params.skipInProgressCheck || '').toLowerCase() === 'true';
        this.configMap.batchFilesPath = params.batchFilesPath || 'milo-process/batching';
        this.configMap.maxFilesPerBatch = parseInt(params.maxFilesPerBatch || '200', 10);
        this.configMap.numBulkReq = parseInt(params.numBulkReq || '20', 10);
        this.extractPrivateKey();
    }

    getConfig() {
        return this.configMap;
    }

    getMsalConfig() {
        const {
            clientId, tenantId, certPassword, pvtKey, certThumbprint,
        } = this.configMap;
        return {
            clientId, tenantId, certPassword, pvtKey, certThumbprint,
        };
    }

    getSiteConfig() {
        const { fgSite, fgRootFolder } = this.configMap;
        return { fgSite, fgRootFolder };
    }

    getFgSite() {
        return this.configMap.fgSite;
    }

    getPromoteIgnorePaths() {
        return this.configMap.promoteIgnorePaths;
    }

    extractPrivateKey() {
        if (!this.configMap.certKey) return;
        const decodedKey = Buffer.from(
            this.configMap.certKey,
            'base64'
        ).toString('utf-8');
        this.configMap.pvtKey = crypto
            .createPrivateKey({
                key: decodedKey,
                passphrase: this.configMap.certPassword,
                format: 'pem',
            })
            .export({
                format: 'pem',
                type: 'pkcs8',
            });
    }

    getSkipInProgressCheck() {
        return true && this.configMap.skipInProg;
    }

    getBatchConfig() {
        return {
            batchFilesPath: this.configMap.batchFilesPath,
            maxFilesPerBatch: this.configMap.maxFilesPerBatch,
        };
    }

    getNumBulkReq() {
        return this.configMap.numBulkReq;
    }
}

module.exports = new AppConfig();
