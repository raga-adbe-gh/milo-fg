/*************************************************************************
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 * Copyright 2021 Adobe
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
 **************************************************************************/
const crypto = require('crypto');
const { getAioLogger } = require('./utils');


class ApplConfig {
    
 appConfig = {}
 
 setAppConfig(params) {
  this.appConfig.clientId = params.clientId;
  this.appConfig.tenantId = params.tenantId;  
  this.appConfig.driveId = params.driveId;  
  this.appConfig.certPassword = params.certPassword;  
  this.appConfig.certKey = params.certKey;
  this.appConfig.certThumbprint = params.certThumbprint;  
  this.extractPrivateKey();
 }

 getConfig() {
   return this.appConfig;
 }

 extractPrivateKey() {
  const decodedKey = Buffer.from(this.appConfig.certKey, 'base64').toString('utf-8');
  this.appConfig.pvtKey = crypto.createPrivateKey({
        key: decodedKey,
        passphrase: this.appConfig.certPassword,
        format: 'pem'
    }).export({
        format: 'pem',
        type: 'pkcs8'
    });
 }

}

module.exports = new ApplConfig();
