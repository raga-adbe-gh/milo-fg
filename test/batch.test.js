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

const { getAioLogger } = require('../actions/utils');
const Batch = require('../actions/batch');

jest.mock('../actions/utils', () => ({
    getAioLogger: jest.fn(() => ({
        info: jest.fn(),
    })),
}));

const mockFilesSdk = {
    write: jest.fn(),
    read: jest.fn().mockResolvedValue('{}'),
    list: jest.fn().mockResolvedValue([]),
};

describe('Batch Class Tests', () => {
    let batch;

    beforeEach(() => {
        batch = new Batch({
            filesSdk: mockFilesSdk,
            instancePath: '/path/to/instance',
            batchNumber: 1,
            maxFilesPerBatch: 200,
        });
    });

    test('Batch constructor initializes properties correctly', () => {
        expect(batch.params).toEqual({
            filesSdk: mockFilesSdk,
            instancePath: '/path/to/instance',
            batchNumber: 1,
            maxFilesPerBatch: 200,
        });
        expect(batch.filesSdk).toBe(mockFilesSdk);
        expect(batch.instancePath).toBe('/path/to/instance');
        expect(batch.batchNumber).toBe(1);
        expect(batch.maxFilesPerBatch).toBe(200);
        expect(batch.batchPath).toBe('/path/to/instance/batch_1');
        expect(batch.batchInfoFile).toBe('/path/to/instance/batch_1/batch_info.json');
        expect(batch.resultsFile).toBe('/path/to/instance/batch_1/results.json');
    });

    test('getBatchNumber returns the correct batch number', () => {
        const result = batch.getBatchNumber();
        expect(result).toBe(1);
    });

    test('getBatchPath returns the correct batch path', () => {
        const result = batch.getBatchPath();
        expect(result).toBe('/path/to/instance/batch_1');
    });

    test('canAddFile returns true when files can be added', () => {
        const result = batch.canAddFile();
        expect(result).toBe(true);
    });

    test('canAddFile returns false when files cannot be added', () => {
        batch.batchFiles = new Array(200); // Max files reached
        const result = batch.canAddFile();
        expect(result).toBe(false);
    });

    test('addFile adds file metadata to batchFiles', async () => {
        const file = { name: 'file1.txt' };
        await batch.addFile(file);
        expect(batch.batchFiles).toHaveLength(1);
        expect(batch.batchFiles[0]).toEqual({ file, batchNumber: 1 });
    });

    test('savePendingFiles writes batchFiles to file', async () => {
        batch.batchFiles = [{ file: { name: 'file1.txt' }, batchNumber: 1 }];
        await batch.savePendingFiles();
        expect(mockFilesSdk.write).toHaveBeenCalledWith(
            '/path/to/instance/batch_1/batch_info.json',
            '[{"file":{"name":"file1.txt"},"batchNumber":1}]'
        );
        expect(batch.batchFiles).toHaveLength(1); // batchFiles should be cleared after saving
    });

    test('savePendingFiles does nothing if batchFiles is empty', async () => {
        await batch.savePendingFiles();
    });

    test('getFiles reads batch info file and returns file contents', async () => {
        mockFilesSdk.read.mockResolvedValue('{"file":{"name":"file1.txt"},"batchNumber":1}');
        const result = await batch.getFiles();
        expect(mockFilesSdk.read).toHaveBeenCalledWith('/path/to/instance/batch_1/batch_info.json');
        expect(result).toEqual({ file: { name: 'file1.txt' }, batchNumber: 1 });
    });

    test('writeResults writes data to results file', async () => {
        const data = { status: 'success' };
        await batch.writeResults(data);
        expect(mockFilesSdk.write).toHaveBeenCalledWith(
            '/path/to/instance/batch_1/results.json',
            '{"status":"success"}'
        );
    });

    test('getResultsContent reads results file and returns parsed data', async () => {
        mockFilesSdk.list.mockResolvedValue(['results.json']);
        mockFilesSdk.read.mockResolvedValue('{"status":"success"}');
        const result = await batch.getResultsContent();
        expect(mockFilesSdk.read).toHaveBeenCalledWith('/path/to/instance/batch_1/results.json');
        expect(result).toEqual({ status: 'success' });
    });
});
