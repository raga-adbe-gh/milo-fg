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

const dotenv = require('dotenv');
const crypto = require('crypto');
const fs = require('fs');
const msal = require('@azure/msal-node');
const applConfig = require('./applConfig');

/**
 * Creates a new SharePoint object, that has two methods:
 * - getDriveId
 * - getAccessToken
 * Internally the function reads and parses the ".env" file and prepares the auth config to invoke the MSAL client for SharePoint authenticating.
 *
 * @returns {object} Sharepoint object
 */
const sharepointAuth = async (logger) => {

    const getSpConfigs = () => {
        const appCfg = applConfig.getConfig();

        const missingConfigs = [];
        if (!appCfg.clientId) {
            missingConfigs.push('CLIENT_ID');
        }
        if (!appCfg.tenantId) {
            missingConfigs.push('TENANT_ID');
        }
        if (!appCfg.driveId) {
            missingConfigs.push('DRIVE_ID');
        }
        if (!appCfg.certPassword) {
            missingConfigs.push('CERT_PASSWORD');
        }
        if (!appCfg.certKey) {
            missingConfigs.push('CERT_KEY');
        }
        if (!appCfg.certThumbprint) {
            missingConfigs.push('CERT_THUMB_PRINT');
        }
        if (!appCfg.pvtKey) {
            missingConfigs.push('PRIVATE_KEY');
        }
        if (missingConfigs.length > 0) {
            throw new Error(`Some mandatory fields have not been configured: ${missingConfigs.join(',')}`);
        }
        const authConfig =
        {
            authConfig: {
                auth: {
                    clientId: appCfg.clientId,
                    authority: `https://login.microsoftonline.com/${appCfg.tenantId}`,
                    knownAuthorities: ['login.microsoftonline.com'],
                    clientCertificate: {
                        privateKey: appCfg.pvtKey,
                        thumbprint: appCfg.certThumbprint,
                    }
                }
            },
            driveId: appCfg.driveId,
        };
        return authConfig;
    };

    const decodeToObject = (base64String) => {
        try {
            return JSON.parse(Buffer.from(base64String, 'base64').toString());
        } catch (err) {
            return {};
        }
    };

    const isTokenExpired = (token) => {
        const tokenParts = token.split('.');
        if (tokenParts.length === 3) {
            const data = decodeToObject(tokenParts[1]);
            if (data && data.exp) {
                return Math.floor(Date.now() / 1000) > data.exp - 10;
            }
        }
        return true;
    };

    const spConfigs = getSpConfigs();
    const authClient = new msal.ConfidentialClientApplication(spConfigs.authConfig);
    let accessToken = '';
    /**
     * Get the access token. If the in-memory token is not expired valid it will be reused. Otherwise, a new token is acquired and returned.
     *
     * @returns {string} the access token
     */
    const getAccessToken = async () => {
        if (!accessToken || isTokenExpired(accessToken)) {
            // logger.info('Requesting new AccessToken');
            const tokens = await authClient.acquireTokenByClientCredential({
                scopes: ['https://graph.microsoft.com/.default']
            });
            accessToken = tokens.accessToken;
            // logger.info(`accessToken is ${accessToken}`);
        } else {
            logger.info('AccessToken valid and not expired.');
        }
        return accessToken;
    };

    /**
     * Returns the Sharepoint driveID as configured in the ".env" file
     *
     * @returns {string} driveId
     */
    const getDriveId = () => spConfigs.driveId;

    return {
        getAccessToken,
        getDriveId,
    };
};

module.exports = {
  sharepointAuth,
};
