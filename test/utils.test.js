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

const utils = require('../actions/utils');

test('interface', () => {
    expect(typeof utils.handleExtension).toBe('function');
});

describe('handleExtension', () => {
    test('docx path', () => {
        expect(utils.handleExtension('/path/to/file.docx')).toEqual('/path/to/file');
    });
    test('xlsx path', () => {
        expect(utils.handleExtension('/path/to/file.xlsx')).toEqual('/path/to/file.json');
    });
    test('svg path', () => {
        expect(utils.handleExtension('/path/to/file.svg')).toEqual('/path/to/file.svg');
    });
    test('docx path', () => {
        expect(utils.handleExtension('/path/to/index.docx')).toEqual('/path/to/');
    });
});
