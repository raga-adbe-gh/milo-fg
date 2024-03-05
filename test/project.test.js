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
describe('project', () => {
    let Project = null;

    beforeAll(() => {
        jest.mock('../actions/utils', () => ({
            ...jest.requireActual('../actions/utils'),
            getAioLogger: () => ({
                info: jest.fn(),
                debug: jest.fn(),
                error: jest.fn(),
            }),
        }));
        Project = require('../actions/project');
    });

    it('Get Project Details', async () => {
        const project = new Project({
            sharepoint: {
                getExcelTable: () => ([[['http://localhost/one']], [['http://localhost/two']]])
            }
        });
        const docs = await project.getProjectDetails();
        const entries = docs.urls.entries();
        let entry = entries.next();
        expect(entry.value[0][0]).toBe('http://localhost/one');
        expect(entry.value[1].doc.filePath).toBe('/one.docx');
        entry = entries.next();
        expect(entry.value[0][0]).toBe('http://localhost/two');
        expect(entry.value[1].doc.filePath).toBe('/two.docx');
    });

    it('Inject Sharepoint Data', () => {
        const project = new Project({});
        const projectUrls = new Map().set('http://localhost/doc1', { doc: { sp: { status: 'DONE' } } });
        const filePaths = new Map().set('/doc1', ['http://localhost/doc1']);
        project.injectSharepointData(projectUrls, filePaths, ['/doc1'], [{ fileSize: 10 }]);
        expect(projectUrls.get('http://localhost/doc1').doc.sp.fileSize).toBe(10);
    });

    it('Update projects with docs', async () => {
        const project = new Project({});
        let errs = 0;
        try { await project.updateProjectWithDocs(); } catch (err) { errs += 1; }
        try { await project.updateProjectWithDocs({}); } catch (err) { errs += 1; }
        expect(errs).toBe(2);
    });
});
