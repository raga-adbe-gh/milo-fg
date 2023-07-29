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

const fetch = require('node-fetch');
const { getAioLogger } = require('./utils');
const appConfig = require('./appConfig');

const logger = getAioLogger();
class FgUser {
    userGroupIds = [];

    constructor({ at }) {
        this.at = at;
    }

    async fetchMGQL(ep, acc = []) {
        try {
            const response = await fetch(ep, {
                headers: {
                    Authorization: `Bearer ${this.at}`,
                },
            });

            if (!response.ok) {
                throw new Error('Failed to fetch data.');
            }

            const data = await response.json();

            // Accumulate the current page's data
            const currentData = data.value;
            acc.push(...currentData);

            // Check if there are more pages (using 'nextLink')
            if (data['@odata.nextLink']) {
                // Fetch the next page using recursion
                return await this.fetchMGQL(data['@odata.nextLink'], acc);
            }

            return acc;
        } catch (error) {
            logger.error('Error fetching data:', error);
            throw error;
        }
    }

    async isInGroups(grpIds) {
        if (!grpIds?.length) return false;
        if (!this.userGroupIds?.length) {
            const res = await this.fetchMGQL(`${appConfig.getConfig().groupCheckUrl}?$select=id`);
            this.userGroupIds = res?.length ? res.map((e) => e.id) : [];
        }
        return (this.userGroupIds || []).find((e) => grpIds.includes(e)) !== undefined;
    }

    async isAdmin() {
        const grpIds = appConfig.getConfig().fgAdminGroups;
        return this.isInGroups(grpIds, this.at);
    }

    async isUser() {
        const grpIds = appConfig.getConfig().fgUserGroups;
        return this.isInGroups(grpIds, this.at);
    }

    async getGroupUsers(grpId) {
        return fetch(
            `${appConfig.getConfig().groupCheckUrl}?$filter=id eq '${grpId}'`,
            {
                headers: {
                    Authorization: `Bearer ${this.at}`
                }
            }
        ).then((resp) => resp.json());
    }
}

module.exports = FgUser;
