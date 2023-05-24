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

const msal = require('@azure/msal-node');
const { getAioLogger } = require('./utils');
const appConfig = require('./appConfig');

/**
 * Creates a new SharePoint object, that has two methods:
 * - getAccessToken
 * Internally the function reads and parses the '.env' file and prepares the auth config to invoke the MSAL client for SharePoint authenticating.
 *
 * @returns {object} Sharepoint object
 */
class SharepointAuth {
    init() {
        const msalConfig = appConfig.getMsalConfig();

        const missingConfigs = [];
        if (!msalConfig.clientId) {
            missingConfigs.push('CLIENT_ID');
        }
        if (!msalConfig.tenantId) {
            missingConfigs.push('TENANT_ID');
        }
        if (!msalConfig.certThumbprint) {
            missingConfigs.push('CERT_THUMB_PRINT');
        }
        if (!msalConfig.pvtKey) {
            missingConfigs.push('PRIVATE_KEY');
        }
        if (missingConfigs.length > 0) {
            throw new Error(
                `Some mandatory fields have not been configured: ${missingConfigs.join(
                    ','
                )}`
            );
        }
        this.authConfig = {
            auth: {
                clientId: msalConfig.clientId,
                authority: `https://login.microsoftonline.com/${msalConfig.tenantId}`,
                knownAuthorities: ['login.microsoftonline.com'],
                clientCertificate: {
                    privateKey: msalConfig.pvtKey,
                    thumbprint: msalConfig.certThumbprint,
                },
            },
        };

        this.authClient = new msal.ConfidentialClientApplication(this.authConfig);

        this.initialized = true;
    }

    decodeToObject(base64String) {
        try {
            return JSON.parse(Buffer.from(base64String, 'base64').toString());
        } catch (err) {
            return {};
        }
    }

    isTokenExpired(token) {
        const tokenParts = token.split('.');
        if (tokenParts.length === 3) {
            const data = this.decodeToObject(tokenParts[1]);
            if (data && data.exp) {
                return Math.floor(Date.now() / 1000) > data.exp - 10;
            }
        }
        return true;
    }

    /**
     * Get the access token. If the in-memory token is not expired valid it will be reused. Otherwise, a new token is acquired and returned.
     *
     * @returns {string} the access token
     */
    async getAccessToken() {
        const logger = getAioLogger();
        if (!this.initialized) this.init();

        if (!this.accessToken || this.isTokenExpired(this.accessToken)) {
            logger.info('Requesting new AccessToken');
            const tokens = await this.authClient.acquireTokenByClientCredential({
                scopes: ['https://graph.microsoft.com/.default'],
            });
            this.accessToken = tokens.accessToken;
        }
        return this.accessToken;
    }
}

module.exports = new SharepointAuth();
