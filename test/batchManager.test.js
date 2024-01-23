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
const filesLib = require('@adobe/aio-lib-files');

jest.mock('@adobe/aio-lib-files', () => jest.fn().mockResolvedValue({
    init: () => ({
        read: jest.fn().mockResolvedValueOnce({}),
        write: jest.fn().mockResolvedValueOnce({}),
    })
}));
const BatchManager = require('../actions/batchManager');
const Batch = require('../actions/batch');

describe('BatchManager', () => {
    let batchManager;

    beforeEach(async () => {
        batchManager = new BatchManager({
            batchConfig: {
                batchFilesPath: 'batchFilesPath',
                maxFilesPerBatch: 1000
            },
            key: 'promoteAction',
            instance: '_milo_pink'
        });
        await batchManager.init();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should initialize params', () => {
            expect(batchManager.params).toEqual({
                batchConfig: {
                    batchFilesPath: 'batchFilesPath',
                    maxFilesPerBatch: 1000
                },
                key: 'promoteAction',
                instance: '_milo_pink'
            });
            expect(batchManager.batches).toEqual([]);
            expect(batchManager.batchConfig).toEqual({
                batchFilesPath: 'batchFilesPath',
                maxFilesPerBatch: 1000
            });
            expect(batchManager.batchFilesPath).toEqual('batchFilesPath');
            expect(batchManager.key).toEqual('promoteAction');
            expect(batchManager.bmPath).toEqual('batchFilesPath/promoteAction');
            expect(batchManager.bmTracker).toEqual('batchFilesPath/promoteAction/tracker.json');
        });
    });

    describe('initInstance', () => {
        it('should initialize instanceKey and instancePath', () => {
            batchManager.initInstance({
                instanceKey: 'instanceKey'
            });
            expect(batchManager.instanceKey).toEqual('instanceKey');
            expect(batchManager.instancePath).toEqual('batchFilesPath/promoteAction/instanceinstanceKey');
            expect(batchManager.instanceFile).toEqual('batchFilesPath/promoteAction/instanceinstanceKey/instance_info.json');
            expect(batchManager.resultsFile).toEqual('batchFilesPath/promoteAction/instanceinstanceKey/instance_results.json');
        });

        it('should initialize instanceKey with default value', () => {
            batchManager.initInstance({});
            expect(batchManager.instanceKey).toEqual('default');
            expect(batchManager.instancePath).toEqual('batchFilesPath/promoteAction/instancedefault');
            expect(batchManager.instanceFile).toEqual('batchFilesPath/promoteAction/instancedefault/instance_info.json');
            expect(batchManager.resultsFile).toEqual('batchFilesPath/promoteAction/instancedefault/instance_results.json');
        });
    });

    describe('initBatch', () => {
        it('should initialize currentBatchNumber and currentBatch', () => {
            batchManager.initBatch({
                batchNumber: 1
            });
            expect(batchManager.currentBatchNumber).toEqual(1);
            expect(batchManager.currentBatch).toBeInstanceOf(Batch);
            expect(batchManager.batches).toEqual([batchManager.currentBatch]);
        });

        it('should not initialize currentBatchNumber and currentBatch if batchNumber is not provided', () => {
            batchManager.initBatch({});
            expect(batchManager.currentBatchNumber).toBeUndefined();
            expect(batchManager.currentBatch).toBeUndefined();
            expect(batchManager.batches).toEqual([]);
        });
    });

    describe('readBmTracker', () => {
        it('should read promoteAction/tracker.json and return the parsed data', async () => {
            filesLib.init.mockResolvedValueOnce({
                read: jest.fn().mockResolvedValueOnce(Buffer.from('{"instanceKeys": ["_milo_pink"], "_milo_pink": {done: true, proceed: true}}'))
            });
            const data = await batchManager.readBmTracker();
            expect(filesLib.read).toHaveBeenCalledWith('batchFilesPath/promoteAction/tracker.json');
            expect(data).toEqual({
                instanceKeys: ['_milo_pink'],
                _milo_pink: {
                    done: true,
                    proceed: true
                }
            });
            it('should return an empty object if there is an error while reading the file', async () => {
                filesLib.read.mockRejectedValueOnce(new Error());
                const data = await batchManager.readBmTracker();
                expect(filesLib.read).toHaveBeenCalledWith('batchFilesPath/promoteAction/tracker.json');
                expect(data).toEqual({});
            });
        });
    });

    describe('writeToBmTracker', () => {
        it('should read promoteAction/tracker.json, update the data, and write it back to the file', async () => {
            filesLib.read.mockResolvedValueOnce(Buffer.from('{"instanceKeys": ["_milo_pink"], "_milo_pink": {done: true, proceed: true}}'));
            await batchManager.writeToBmTracker({
                _milo_pink: {
                    done: false,
                    proceed: false
                }
            });
            expect(filesLib.read).toHaveBeenCalledWith('batchFilesPath/promoteAction/tracker.json');
            expect(filesLib.write).toHaveBeenCalledWith('batchFilesPath/promoteAction/tracker.json', '{"instanceKeys":["_milo_pink"],"_milo_pink":{"done":false,"proceed":false}}');
        });
    });

    describe('getInstanceFileContent', () => {
        it('should read instance_info.json and return the parsed data', async () => {
            filesLib.read.mockResolvedValueOnce(Buffer.from('{"lastBatch": 1, "dtls": {}}'));
            const data = await batchManager.getInstanceFileContent();
            expect(filesLib.read).toHaveBeenCalledWith('batchFilesPath/promoteAction/instancedefault/instance_info.json');
            expect(data).toEqual({
                lastBatch: 1,
                dtls: {}
            });
        });

        it('should return an empty object if there is an error while reading the file', async () => {
            filesLib.read.mockRejectedValueOnce(new Error());
            const data = await batchManager.getInstanceFileContent();
            expect(filesLib.read).toHaveBeenCalledWith('batchFilesPath/promoteAction/instancedefault/instance_info.json');
            expect(data).toEqual({});
        });
    });

    describe('writeToInstanceFile', () => {
        it('should write the data to instance_info.json', async () => {
            await batchManager.writeToInstanceFile({
                lastBatch: 1,
                dtls: {}
            });
            expect(filesLib.write).toHaveBeenCalledWith('batchFilesPath/promoteAction/instancedefault/instance_info.json', '{"lastBatch":1,"dtls":{}}');
        });
    });

    describe('addToInstanceFile', () => {
        it('should read instance_info.json, update the data, and write it back to the file', async () => {
            filesLib.read.mockResolvedValueOnce(Buffer.from('{"lastBatch": 1, "dtls": {}}'));
            await batchManager.addToInstanceFile({
                dtls: {
                    batchNumber: 1,
                    activationId: '1'
                }
            });
            expect(filesLib.read).toHaveBeenCalledWith('batchFilesPath/promoteAction/instancedefault/instance_info.json');
            expect(filesLib.write).toHaveBeenCalledWith('batchFilesPath/promoteAction/instancedefault/instance_info.json', '{"lastBatch":1,"dtls":{"batchNumber":1,"activationId":"1"}}');
        });
    });

    describe('getInstanceData', () => {
        it('should read promoteAction/tracker.json, find the instance data, and read instance_info.json', async () => {
            filesLib.read.mockResolvedValueOnce(Buffer.from('{"instanceKeys": ["_milo_pink"], "_milo_pink": {done: false, proceed: true}}'));
            const data = await batchManager.getInstanceData();
            expect(filesLib.read).toHaveBeenCalledTimes(2);
            expect(data).toEqual({
                lastBatch: 1,
                dtls: {}
            });
        });

        it('should return null if there is no instance data', async () => {
            filesLib.read.mockResolvedValueOnce(Buffer.from('{"instanceKeys": []}'));
            const data = await batchManager.getInstanceData();
            expect(filesLib.read).toHaveBeenCalledTimes(1);
            expect(data).toBeNull();
        });

        it('should return null if there is an error while reading the file', async () => {
            filesLib.read.mockRejectedValueOnce(new Error());
            const data = await batchManager.getInstanceData();
            expect(filesLib.read).toHaveBeenCalledTimes(1);
            expect(data).toBeNull();
        });
    });

    describe('finalizeInstance', () => {
        it('should save pending files in the current batch, update instance_info.json, and update promoteAction/tracker.json', async () => {
            batchManager.currentBatch = {
                savePendingFiles: jest.fn(),
                getBatchNumber: jest.fn(() => 1)
            };
            await batchManager.finalizeInstance({
                dtls: {
                    batchNumber: 1,
                    activationId: '1'
                }
            });
            expect(batchManager.currentBatch.savePendingFiles).toHaveBeenCalledTimes(1);
            expect(filesLib.write).toHaveBeenCalledWith('batchFilesPath/promoteAction/instancedefault/instance_info.json', '{"lastBatch":1,"dtls":{"batchNumber":1,"activationId":"1"}}');
            expect(filesLib.write).toHaveBeenCalledWith('batchFilesPath/promoteAction/tracker.json', '{"default":{"done":false,"proceed":true}}');
        });
    });

    describe('markComplete', () => {
        it('should update promoteAction/tracker.json and write the results to instance-results file', async () => {
            await batchManager.markComplete({
                results: []
            });
            expect(filesLib.write).toHaveBeenCalledWith('batchFilesPath/promoteAction/tracker.json', '{"default":{"done":true,"proceed":false}}');
            expect(filesLib.write).toHaveBeenCalledWith('batchFilesPath/promoteAction/instancedefault/instance_results.json', '[]');
        });
    });

    describe('writeResults', () => {
        it('should write the data to instance-results file', async () => {
            await batchManager.writeResults({
                results: []
            });
            expect(filesLib.write).toHaveBeenCalledWith('batchFilesPath/promoteAction/instancedefault/instance_results.json', '[]');
        });

        it('should catch errors while writing the file', async () => {
            filesLib.write.mockRejectedValueOnce(new Error());
            await batchManager.writeResults({
                results: []
            });
            expect(filesLib.write).toHaveBeenCalledWith('batchFilesPath/promoteAction/instancedefault/instance_results.json', '[]');
        });
    });

    describe('getResultsContent', () => {
        it('should read instance-results file and return the parsed data', async () => {
            filesLib.list.mockResolvedValueOnce([{
                length: 1
            }]);
            filesLib.read.mockResolvedValueOnce(Buffer.from('{"results": []}'));
            const data = await batchManager.getResultsContent();
            expect(filesLib.list).toHaveBeenCalledWith('batchFilesPath/promoteAction/instancedefault/instance_results.json');
            expect(filesLib.read).toHaveBeenCalledWith('batchFilesPath/promoteAction/instancedefault/instance_results.json');
            expect(data).toEqual({
                results: []
            });
        });

        it('should return null if there is an error while reading the file', async () => {
            filesLib.list.mockResolvedValueOnce([{
                length: 1
            }]);
            filesLib.read.mockRejectedValueOnce(new Error());
            const data = await batchManager.getResultsContent();
            expect(filesLib.list).toHaveBeenCalledWith('batchFilesPath/promoteAction/instancedefault/instance_results.json');
            expect(filesLib.read).toHaveBeenCalledWith('batchFilesPath/promoteAction/instancedefault/instance_results.json');
            expect(data).toBeNull();
        });

        it('should return null if there is no file', async () => {
            filesLib.list.mockResolvedValueOnce([]);
            const data = await batchManager.getResultsContent();
            expect(filesLib.list).toHaveBeenCalledWith('batchFilesPath/promoteAction/instancedefault/instance_results.json');
            expect(data).toBeNull();
        });
    });

    describe('cleanupFiles', () => {
        it('should delete the instance directory', async () => {
            await batchManager.cleanupFiles();
            expect(filesLib.delete).toHaveBeenCalledWith('batchFilesPath/promoteAction/instancedefault/');
        });
    });

    describe('getCurrentBatch', () => {
        it('should return the current batch or create a new one if it does not exist', async () => {
            batchManager.currentBatch = null;
            filesLib.write.mockResolvedValueOnce({});
            const batch = await batchManager.getCurrentBatch();
            expect(batch).toBeInstanceOf(Batch);
            expect(batchManager.currentBatch).toBe(batch);
        });
    });

    describe('createBatch', () => {
        it('should create a new batch and set it as the current batch', async () => {
            batchManager.currentBatch = null;
            filesLib.write.mockResolvedValueOnce({});
            const batch = await batchManager.createBatch();
            expect(batch).toBeInstanceOf(Batch);
            expect(batchManager.currentBatch).toBe(batch);
            expect(batchManager.batches).toEqual([batch]);
        });
    });

    describe('getNewBatchNumber', () => {
        it('should return the current batch number plus one', () => {
            batchManager.currentBatch = {
                getBatchNumber: jest.fn(() => 1)
            };
            const batchNumber = batchManager.getNewBatchNumber();
            expect(batchManager.currentBatch.getBatchNumber).toHaveBeenCalledTimes(1);
            expect(batchNumber).toEqual(1);
        });

        it('should return 0 if there is no current batch', () => {
            batchManager.currentBatch = null;
            const batchNumber = batchManager.getNewBatchNumber();
            expect(batchNumber).toEqual(0);
        });
    });

    describe('getBatchesInfo', () => {
        it('should return an array of batch info objects', () => {
            batchManager.batches = [{
                getBatchNumber: jest.fn(() => 1)
            },
            {
                getBatchNumber: jest.fn(() => 2)
            }];
            const batchesInfo = batchManager.getBatchesInfo();
            expect(batchesInfo).toEqual([{
                batchNumber: 1
            },
            {
                batchNumber: 2
            }]);
        });
    });

    describe('addFile', () => {
        it('should add the file to the current batch or create a new one if it overflows', async () => {
            batchManager.currentBatch = {
                canAddFile: jest.fn(() => true),
                addFile: jest.fn()
            };
            await batchManager.addFile({});
            expect(batchManager.currentBatch.canAddFile).toHaveBeenCalledTimes(1);
            expect(batchManager.currentBatch.addFile).toHaveBeenCalledTimes(1);

            batchManager.currentBatch = {
                canAddFile: jest.fn(() => false),
                addFile: jest.fn(),
                savePendingFiles: jest.fn()
            };
            await batchManager.addFile({}, 1);
            expect(batchManager.currentBatch.canAddFile).toHaveBeenCalledTimes(1);
            expect(batchManager.currentBatch.addFile).toHaveBeenCalledTimes(0);
            expect(batchManager.currentBatch.savePendingFiles).toHaveBeenCalledTimes(1);
            expect(batchManager.createBatch).toHaveBeenCalledTimes(1);
            expect(batchManager.currentBatch.canAddFile).toHaveBeenCalledTimes(1);
            expect(batchManager.currentBatch.addFile).toHaveBeenCalledTimes(1);
        });
    });

    describe('getBatches', () => {
        it('should return the batches linked to the BatchManager', () => {
            batchManager.batches = [{
                getBatchNumber: jest.fn(() => 1)
            },
            {
                getBatchNumber: jest.fn(() => 2)
            }];
            const batches = batchManager.getBatches();
            expect(batches).toEqual([{
                getBatchNumber: jest.fn(() => 1)
            },
            {
                getBatchNumber: jest.fn(() => 2)
            }]);
        });
    });
});
