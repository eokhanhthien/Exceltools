/* BỘ ĐIỀU KHIỂN UI - STUDIO PIPELINE */

// --- STATE QUẢN LÝ ---
const AppState = {
    rootFileCache: null,    // Cache toàn bộ các Sheet của File Gốc { fileName, workbook, sheetNames, sheetsData }
    rootSelectedSheet: "",  // Tên Sheet đang dùng làm mốc
    rootHeaderRowIndex: 0,  // Dòng bắt đầu làm tiêu đề (0-indexed)
    rootAutoFixFonts: true, // Tự động sửa lỗi font (TCVN3/VNI) - Mặc định BẬT
    rootEncodingType: 'AUTO', // Loại bảng mã (TCVN3, VNI, AUTO)
    rootData: [],           // Dữ liệu gốc ở node LOAD
    rootHeaders: [],        // Tiêu đề cột gốc
    steps: [],              // Danh sách các bước
    activeStepId: null,     // Bước đang bấm vào để edit
    cachedResults: new Map() // ID Bước -> Dữ liệu đầu ra của bước đó (Tối ưu RAM)
};

// Khởi tạo một bước (Step) trống
function createStep(type) {
    const id = type.toLowerCase() + '-' + Date.now();
    let title = "";
    let config = {};

    if (type === 'FILTER') { title = "Lọc Dữ Liệu"; config = { conditions: [], logicType: "AND" }; }
    else if (type === 'VLOOKUP') { title = "Merge Bảng Data"; config = { joinType: 'LEFT', lookupData: null, grabColumns: [], enableFlag: true, flagColName: 'Trang_Thai_Khop' }; }
    else if (type === 'GROUP_BY') { title = "Gộp (Group By)"; config = { aggregates: [] }; }
    else if (type === 'CONDITIONAL_COLUMN') { title = "Thêm Cột (Logic IF)"; config = { newColName: "", rules: [], elseVal: "", elseType: "VALUE" }; }
    else if (type === 'MATH_COMPUTE') { title = "Công Thức Toán Học"; config = { newColName: "", expression: "" }; }
    else if (type === 'SELECT_COLUMNS') { title = "Chọn/Đổi Tên Cột"; config = { columns: [] }; }
    else if (type === 'COMPARE') { title = "So Sánh 2 File"; config = { compareData: null, baseKey: "", compareKey: "", baseCompareCol: "", secondaryCompareCol: "", conditionType: "THRESHOLD_INC", diffThreshold: 50000000, topXValue: 30 }; }

    return { id, type, title, config, disabled: false };
}

// --- RENDERING PIPELINE STEPS (LEFT SIDEBAR) ---
function renderPipelineSteps() {
    const container = document.getElementById('pipeline-steps');
    container.innerHTML = `
        <div class="step-node-container ${AppState.activeStepId === 'ROOT' ? 'active' : ''}" data-id="ROOT">
            <div class="step-dot"></div>
            <div class="step-card ${AppState.activeStepId === 'ROOT' ? 'active' : ''}">
                <div class="step-title">0. Kho Data Gốc <span class="badge badge-blue">ROOT</span></div>
                <div class="step-desc">${AppState.rootHeaders.length ? AppState.rootData.length.toLocaleString() + ' dòng dữ liệu' : 'Chưa tải file'}</div>
            </div>
        </div>
    `;

    AppState.steps.forEach((step, index) => {
        const div = document.createElement('div');
        div.className = `step-node-container ${AppState.activeStepId === step.id ? 'active' : ''}`;
        div.dataset.id = step.id;
        
        div.innerHTML = `
            <div class="step-dot"></div>
            <div class="step-card ${AppState.activeStepId === step.id ? 'active' : ''} ${step.disabled ? 'disabled' : ''}">
                <div class="step-title">
                    <span class="step-title-text" title="${index + 1}. ${step.title}">${index + 1}. ${step.title}</span>
                    <div class="step-actions">
                        <button class="btn-icon btn-toggle-step" title="${step.disabled ? 'Bật' : 'Tắt'}">
                            ${step.disabled 
                                ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>` 
                                : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`
                            }
                        </button>
                        <button class="btn-icon btn-del-step" title="Xoá">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    </div>
                </div>
                <div class="step-desc" title="${getStepDesc(step)}">${getStepDesc(step)}</div>
            </div>
        `;
        container.appendChild(div);
    });

    // Bắt sự kiện Click vào Container để Active
    document.querySelectorAll('.step-node-container').forEach(node => {
        node.addEventListener('click', (e) => {
            if (e.target.closest('.btn-toggle-step') || e.target.closest('.btn-del-step')) return; // Bỏ qua nếu bấm nút con
            AppState.activeStepId = node.dataset.id;
            renderPipelineSteps();
            renderConfigPanel();
            renderPreviewAtActiveStep();
        });
    });

    // Bắt sự kiện Xoá/Tắt
    document.querySelectorAll('.btn-del-step').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.closest('.step-node-container').dataset.id;
            AppState.steps = AppState.steps.filter(s => s.id !== id);
            if (AppState.activeStepId === id) AppState.activeStepId = 'ROOT';
            recalculatePipeline(true);
        });
    });
    
    document.querySelectorAll('.btn-toggle-step').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.closest('.step-node-container').dataset.id;
            const step = AppState.steps.find(s => s.id === id);
            step.disabled = !step.disabled;
            recalculatePipeline(true);
        });
    });
}

function getStepDesc(step) {
    if (step.type === 'FILTER') return step.config.conditions.length ? `Lọc ${step.config.conditions.length} điều kiện (${step.config.logicType || 'AND'})` : 'Chưa cấu hình';
    if (step.type === 'VLOOKUP') return step.config.lookupData ? `Join ${step.config.grabColumns.length} cột qua ${step.config.baseKey || '?'}` : 'Chưa nhập file';
    if (step.type === 'GROUP_BY') return step.config.groupCol ? `Nhóm theo ${step.config.groupCol}` : 'Chưa cấu hình';
    if (step.type === 'CONDITIONAL_COLUMN') return step.config.newColName ? `Tạo cột: ${step.config.newColName}` : 'Chưa cấu hình';
    if (step.type === 'MATH_COMPUTE') return step.config.newColName ? `Làm toán: ${step.config.newColName}` : 'Chưa cấu hình';
    if (step.type === 'SELECT_COLUMNS') return step.config.columns.length ? `Giữ ${step.config.columns.length} cột xuất` : 'Chưa cấu hình';
    if (step.type === 'COMPARE') return step.config.compareData ? `So sánh cột ${step.config.baseCompareCol || '?'}` : 'Chưa cấu hình file';
    return '';
}

// --- ADD NEW STEP ---
document.getElementById('btn-add-step').addEventListener('click', (e) => {
    document.getElementById('dropdown-add-step').classList.toggle('hidden');
    e.stopPropagation();
});

document.addEventListener('click', () => {
    document.getElementById('dropdown-add-step').classList.add('hidden');
});

document.querySelectorAll('#dropdown-add-step a').forEach(a => {
    a.addEventListener('click', (e) => {
        e.preventDefault();
        const type = e.target.dataset.action;
        const newStep = createStep(type);
        AppState.steps.push(newStep);
        AppState.activeStepId = newStep.id;
        renderPipelineSteps();
        renderConfigPanel();
    });
});

// --- EXECUTION (ENGINE BRIDGE) ---
// Chạy engine tính toán toàn bộ các node từ trên xuống dưới
async function recalculatePipeline(silent = false) {
    if (AppState.rootData.length === 0) return;
    
    document.getElementById('preview-mini-loading').classList.remove('hidden');
    
    const pipelineContainer = document.getElementById('pipeline-steps');
    if (pipelineContainer && !silent) pipelineContainer.classList.add('is-calculating');
    
    setTimeout(async () => {
        let currentData = [...AppState.rootData];
        AppState.cachedResults.set('ROOT', currentData);

        try {
            for (const step of AppState.steps) {
                if (!step.disabled) {
                    currentData = applyStepToData(currentData, step);
                }
                AppState.cachedResults.set(step.id, currentData || []); // Cache kết quả sau mỗi bước
            }
        } catch (err) {
            console.error("Lỗi Pipeline:", err);
        }

        renderPipelineSteps(); // Cập nhật Mô tả
        renderPreviewAtActiveStep();
        
        document.getElementById('preview-mini-loading').classList.add('hidden');
        
        // Tắt animation dây chuyền sau khi render xong 1 khoảng nhỏ để có cảm giác luồng chạy
        if (pipelineContainer) {
            setTimeout(() => pipelineContainer.classList.remove('is-calculating'), 400);
        }
    }, 10);
}

// --- QUẢN LÝ KỊCH BẢN (PRESET: SAVE / LOAD) ---
if (document.getElementById('btn-export-preset')) {
    document.getElementById('btn-export-preset').addEventListener('click', () => {
        if (AppState.steps.length === 0) {
            alert("Chưa có bước Pipeline nào để xuất Kịch bản!");
            return;
        }
        // Clone và dọn dẹp data nặng trước khi xuất (nếu có cache)
        const exportSteps = AppState.steps.map(s => {
            let clone = JSON.parse(JSON.stringify(s));
            if (clone.type === 'VLOOKUP' && clone.config.lookupData) {
                clone.config.lookupData = null; 
            }
            if (clone.type === 'COMPARE' && clone.config.compareData) {
                clone.config.compareData = null;
            }
            return clone;
        });

        const presetStr = JSON.stringify(exportSteps, null, 2);
        const blob = new Blob([presetStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "DataX_Preset.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    document.getElementById('btn-import-preset').addEventListener('click', () => {
        document.getElementById('preset-file-input').click();
    });

    document.getElementById('preset-file-input').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const stepsObj = JSON.parse(evt.target.result);
                    if (Array.isArray(stepsObj)) {
                        AppState.steps = stepsObj;
                        AppState.activeStepId = stepsObj.length > 0 ? stepsObj[0].id : 'ROOT';
                        renderPipelineSteps();
                        renderConfigPanel();
                        recalculatePipeline();
                        alert("Đã nạp Kịch bản Tự động hóa thành công!");
                    } else {
                        alert("File Kịch Bản không đúng định dạng chuẩn của DataX!");
                    }
                } catch (err) {
                    alert("Lỗi đọc File Kịch Bản: " + err.message);
                }
            };
            reader.readAsText(file);
            e.target.value = ''; // Reset input để cho phép import lại cùng 1 file
        }
    });
}

// Lấy columns header của step TRƯỚC DOS
function getHeadersAtCurrentStep() {
    if (!AppState.activeStepId || AppState.activeStepId === 'ROOT') return AppState.rootHeaders;
    
    const idx = AppState.steps.findIndex(s => s.id === AppState.activeStepId);
    let targetData = [];
    if (idx > 0) {
        targetData = AppState.cachedResults.get(AppState.steps[idx-1].id) || [];
    } else {
        targetData = AppState.cachedResults.get('ROOT') || [];
    }
    
    return targetData.length > 0 ? Object.keys(targetData[0]) : AppState.rootHeaders;
}

// Khởi tạo global instance cho spreadsheet
let gridInstance = null;

// Hiển thị Preview Data tại Step click vào
function renderPreviewAtActiveStep() {
    const activeData = AppState.cachedResults.get(AppState.activeStepId);
    
    let renderData = activeData;
    if (!renderData || renderData.length === 0) {
        // Dữ liệu trống
        renderData = [];
    }

    const headers = renderData.length > 0 ? Object.keys(renderData[0]) : getHeadersAtCurrentStep();
    
    // Build x-spreadsheet data format
    let limit = Math.min(1000, renderData.length); // Tải tối đa 1000 dòng preview cho nhẹ trình duyệt
    let rowsObj = {};
    
    // Header Row (Dòng 0)
    let maxCols = Math.max(headers.length, 10); 
    rowsObj[0] = { cells: {} };
    for(let cIdx = 0; cIdx < headers.length; cIdx++) {
        rowsObj[0].cells[cIdx] = { text: headers[cIdx], style: 0 };
    }

    // Data Rows
    for (let i = 0; i < limit; i++) {
        const row = renderData[i];
        rowsObj[i + 1] = { cells: {} };
        for(let cIdx = 0; cIdx < headers.length; cIdx++) {
            const h = headers[cIdx];
            const val = row[h] !== undefined && row[h] !== null ? String(row[h]) : '';
            rowsObj[i + 1].cells[cIdx] = { text: val };
        }
    }

    const sheetData = {
        name: AppState.activeStepId === 'ROOT' ? 'Dữ Liệu Gốc' : 'Bảng Preview',
        rows: rowsObj,
        styles: [
            { bgcolor: '#f8f9fa', font: { bold: true }, color: '#5f6368', align: 'center' }
        ]
    };

    if (!document.getElementById('x-spreadsheet-container')) return; // Đảm bảo HTML đã load

    if (!gridInstance) {
        gridInstance = x_spreadsheet('#x-spreadsheet-container', {
            mode: 'edit',
            showToolbar: false,
            showGrid: true,
            showContextmenu: true,
            view: {
                height: () => document.getElementById('x-spreadsheet-wrapper').clientHeight || 500,
                width: () => document.getElementById('x-spreadsheet-wrapper').clientWidth || 800,
            }
        });
        
        // Cấu hình sự kiện Update từ Grid bắn ngược ra Data
        gridInstance.on('cell-edited', (text, ri, ci) => {
            if (AppState.activeStepId === 'ROOT') {
                if (ri === 0) { // Đang sửa tựa đề cột
                    alert("Tạm thời chưa hỗ trợ đổi Tên Cột gõ trực tiếp. Vui lòng dùng khối [Xào Cột] để Rename!");
                    gridInstance.loadData(sheetData); // Revert
                    return; 
                }
                if (AppState.rootData.length > 0 && ri > 0) {
                    const hArray = Object.keys(AppState.rootData[0]);
                    const key = hArray[ci];
                    if (key && AppState.rootData[ri - 1]) {
                        AppState.rootData[ri - 1][key] = text; // Cập nhật raw data
                        // Trì hoãn 1 chút để Grid render mượt rồi mới recalculate pipeline
                        setTimeout(() => recalculatePipeline(), 50);
                    }
                }
            } else {
                alert("❌ BẢO VỆ DỮ LIỆU: Xin lỗi, bạn chỉ được phép SỬA TAY nếu đang đứng ở Thẻ [0. File Data Gốc].\\n\\nỞ các đoạn tiếp theo, dữ liệu đang được Tự Động Tính. Nếu cho sửa sẽ làm trật đường ray luồng dữ liệu của Pipeline!");
                // Revert
                gridInstance.loadData(sheetData);
            }
        });

        // Lắng nghe window size đổi để vẽ lại Canvas
        window.addEventListener('resize', () => {
            // Không làm gì, x-spreadsheet tự kéo theo function view config
        });
    }

    gridInstance.loadData(sheetData);
    
    // Cập nhật text thống kê
    document.getElementById('preview-row-count').innerText = `${renderData.length.toLocaleString()} dòng (Full)`;
    document.getElementById('preview-col-count').innerText = `${headers.length} cột`;
}

// --- CONFIG PANEL RENDERING (Giao diện cấu hình động) ---
function renderConfigPanel() {
    const emptyState = document.getElementById('config-empty');
    const dynamicPane = document.getElementById('config-dynamic');

    dynamicPane.innerHTML = "";
    if (!AppState.activeStepId) {
        emptyState.classList.remove('hidden');
        dynamicPane.classList.add('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    dynamicPane.classList.remove('hidden');

    if (AppState.activeStepId === 'ROOT') {
        let rootSheetSelectorHtml = '';
        if (AppState.rootFileCache && AppState.rootFileCache.sheetNames.length > 0) {
            const opts = AppState.rootFileCache.sheetNames.map(s => 
                `<option value="${s}" ${s === AppState.rootSelectedSheet ? 'selected' : ''}>${s}</option>`
            ).join('');
            rootSheetSelectorHtml = `
                <div class="form-group" style="margin-top: 15px;">
                    <label class="form-label" style="font-weight: 600; color: var(--primary);">📚 Lựa chọn Sheet (Kho Data Gốc)</label>
                    <select id="root-sheet-select" class="form-control">${opts}</select>
                </div>
            `;
        }

        let rootHeaderRowHtml = '';
        let rootFontFixHtml = '';
        if (AppState.rootFileCache) {
            rootHeaderRowHtml = `
                <div class="form-group" style="margin-top: 15px;">
                    <label class="form-label" style="font-weight: 600; color: var(--primary);">📍 Dòng làm Tiêu đề (Header Row Index)</label>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <input type="number" id="root-header-index" class="form-control" value="${AppState.rootHeaderRowIndex || 0}" min="0" style="width:80px;" />
                        <span style="font-size:12px; color:#666;">(Dòng ${(AppState.rootHeaderRowIndex || 0) + 1})</span>
                    </div>
                </div>
            `;

            // Font repair is giờ đây hoàn toàn tự động và ẩn đi để tối ưu trải nghiệm "Không Cần Chạm"
            rootFontFixHtml = `
                <div id="encoding-status-box" style="margin-top: 15px; padding: 10px; background: #f0f7ff; border-radius: 8px; border: 1px solid #d0e7ff;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:16px;">✨</span>
                        <div>
                            <div style="font-weight: 600; font-size:13px; color: var(--primary);">Tự động sửa lỗi Font (Smart)</div>
                            <p id="encoding-info-text" style="font-size:11px; color:#666; margin:2px 0 0 0;">Đang quét định dạng ô...</p>
                        </div>
                    </div>
                </div>
            `;
        }

        dynamicPane.innerHTML = `
            <h3 class="config-title">Nguồn Dữ Liệu Gốc</h3>
            <p class="config-desc">Nạp dữ liệu qua <b>ExcelJS Engine</b>. Tự động nhận diện font TCVN3/VNI dựa trên Cell Style.</p>
            <div class="pipeline-dropzone" id="root-dropzone">
                <div style="font-size: 24px; color: var(--primary);">📥</div>
                <div style="margin-top: 5px; font-weight: 500;">Bấm tải lên hoặc Kéo File vào đây</div>
                <input type="file" id="root-file-input" accept=".xlsx,.xls,.csv" hidden />
            </div>
            ${AppState.rootData.length > 0 ? `<p style="margin-top: 15px; color: var(--success); font-weight: bold;">✅ OK: ${AppState.rootData.length.toLocaleString()} dòng</p>` : ''}
            ${rootSheetSelectorHtml}
            ${rootHeaderRowHtml}
            ${rootFontFixHtml}
        `;

        const triggerReparse = async () => {
            if (AppState.rootFileCache && AppState.rootFileCache.workbook) {
                const sheetName = AppState.rootSelectedSheet;
                const worksheet = AppState.rootFileCache.workbook.getWorksheet(sheetName);
                
                // Mặc định luôn sửa lỗi (AppState.rootAutoFixFonts = true)
                const result = await extractSheetData(worksheet, AppState.rootHeaderRowIndex, true, 'AUTO');
                
                AppState.rootData = result.data;
                AppState.rootHeaders = result.headers;
                
                const infoEl = document.getElementById('encoding-info-text');
                if (infoEl) {
                    if (result.detectedEncoding && result.detectedEncoding !== 'NONE') {
                        infoEl.innerHTML = `🚀 Đã sửa lỗi font: <b>${result.detectedEncoding}</b>`;
                    } else {
                        infoEl.innerHTML = "✨ Dữ liệu sạch (Unicode).";
                    }
                }
                
                recalculatePipeline();
                renderPreviewAtActiveStep();
                renderPipelineSteps();
            }
        };

        if (document.getElementById('root-sheet-select')) {
            document.getElementById('root-sheet-select').addEventListener('change', async (e) => {
                const sheetName = e.target.value;
                AppState.rootSelectedSheet = sheetName;
                
                // Trích xuất data từ workbook cache với settings hiện tại
                const worksheet = AppState.rootFileCache.workbook.getWorksheet(sheetName);
                const result = await extractSheetData(worksheet, AppState.rootHeaderRowIndex, AppState.rootAutoFixFonts, AppState.rootEncodingType);
                
                AppState.rootData = result.data;
                AppState.rootHeaders = result.headers;
                
                recalculatePipeline();
                renderPreviewAtActiveStep();
                renderConfigPanel();
            });
        }

        if (document.getElementById('root-header-index')) {
            document.getElementById('root-header-index').addEventListener('change', (e) => {
                AppState.rootHeaderRowIndex = parseInt(e.target.value) || 0;
                triggerReparse();
            });
        }


        // Sự kiện Upload Root
        const dropzone = document.getElementById('root-dropzone');
        const fileInput = document.getElementById('root-file-input');
        dropzone.addEventListener('click', () => fileInput.click());
        
        fileInput.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                document.getElementById('global-loading').classList.remove('hidden');
                document.getElementById('global-loading-text').innerText = "Đang đọc cấu trúc file...";
                try {
                    const result = await readExcelFile(e.target.files[0]);
                    AppState.rootFileCache = result;
                    AppState.rootSelectedSheet = result.sheetNames[0];
                    AppState.rootHeaderRowIndex = 0;
                    AppState.rootAutoFixFonts = true;
                    AppState.rootEncodingType = 'AUTO';
                    
                    // Lấy data từ sheet đầu tiên
                    const sheetData = result.sheetsData[AppState.rootSelectedSheet];
                    AppState.rootData = sheetData.data;
                    AppState.rootHeaders = sheetData.headers;

                    await recalculatePipeline();
                    renderConfigPanel(); 
                } catch(e) {
                    alert("Lỗi đọc file: " + e.message);
                } finally {
                    document.getElementById('global-loading').classList.add('hidden');
                }
            }
        });
        return;
    }

    // RENDER CHO CÁC STEP CỤ THỂ
    const step = AppState.steps.find(s => s.id === AppState.activeStepId);
    const availableHeaders = getHeadersAtCurrentStep();
    const optHtml = availableHeaders.map(h => `<option value="${h}">${h}</option>`).join('');

    /** BƯỚC FILTER **/
    if (step.type === 'FILTER') {
        // Luôn đảm bảo có ít nhất 1 dòng lọc nếu người dùng chưa cấu hình gì
        if (!step.config.conditions || step.config.conditions.length === 0) {
            step.config.conditions = [{ col: availableHeaders[0] || "", op: "CONTAINS", val: "" }];
        }

        dynamicPane.innerHTML = `
            <div class="filter-logic-container">
                <span class="logic-label">LOGIC:</span>
                <div class="filter-logic-group" id="logic-group">
                    <button class="btn-logic-toggle ${step.config.logicType === 'AND' ? 'active' : ''}" data-logic="AND">TẤT CẢ (AND)</button>
                    <button class="btn-logic-toggle ${step.config.logicType === 'OR' ? 'active' : ''}" data-logic="OR">BẤT KỲ (OR)</button>
                </div>
            </div>

            <div id="filter-conditions-list"></div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px; padding-top:12px; border-top:1px dashed var(--border);">
                <button class="btn btn-add" id="btn-add-condition" style="flex:1; height:32px; font-size:11px; margin-right:8px;">+ THÊM ĐIỀU KIỆN</button>
                <button class="btn-text-danger" id="btn-clear-all" style="font-size:10px;">Xoá tất cả</button>
            </div>
        `;

        const renderConditions = () => {
            const list = document.getElementById('filter-conditions-list');
            list.innerHTML = "";
            step.config.conditions.forEach((cond, idx) => {
                const item = document.createElement('div');
                item.className = 'condition-item';
                item.innerHTML = `
                    <div style="display:flex; align-items:center; margin-bottom:6px;">
                        <span class="cond-index">${idx+1}</span>
                        <select class="form-control cond-col" data-idx="${idx}" style="height:28px; padding:2px 8px; font-size:12px; font-weight:600;">
                            <option value="">-- Chọn cột --</option>
                            ${optHtml}
                        </select>
                        <button class="btn-icon btn-del-cond" data-idx="${idx}" style="margin-left:6px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                    </div>
                    <div style="display:grid; grid-template-columns:100px 1fr; gap:6px;">
                        <select class="form-control cond-op" data-idx="${idx}" style="height:28px; padding:2px 8px; font-size:12px;">
                            <option value="CONTAINS" ${cond.op === 'CONTAINS' ? 'selected' : ''}>Chứa</option>
                            <option value="EQUALS" ${cond.op === 'EQUALS' ? 'selected' : ''}>Bằng (=)</option>
                            <option value="NOT_EQUALS" ${cond.op === 'NOT_EQUALS' ? 'selected' : ''}>Khác (!=)</option>
                            <option value="STARTS_WITH" ${cond.op === 'STARTS_WITH' ? 'selected' : ''}>Bắt đầu</option>
                            <option value="IN" ${cond.op === 'IN' ? 'selected' : ''}>List (IN)</option>
                        </select>
                        <input type="text" class="form-control cond-val" data-idx="${idx}" placeholder="Giá trị..." value="${cond.val || ""}" style="height:28px; padding:2px 8px; font-size:12px;" />
                    </div>
                    ${cond.op === 'IN' ? `<p style="font-size:9px; color:var(--primary); margin-top:4px;">* Dùng dấu phẩy hoặc chấm phẩy</p>` : ''}
                `;
                list.appendChild(item);
                if (cond.col) item.querySelector('.cond-col').value = cond.col;
            });

            // Gắn sự kiện
            list.querySelectorAll('.cond-col').forEach(el => el.addEventListener('change', (e) => {
                step.config.conditions[e.target.dataset.idx].col = e.target.value;
                recalculatePipeline();
            }));
            list.querySelectorAll('.cond-op').forEach(el => el.addEventListener('change', (e) => {
                step.config.conditions[e.target.dataset.idx].op = e.target.value;
                recalculatePipeline();
                renderConditions();
            }));
            list.querySelectorAll('.cond-val').forEach(el => el.addEventListener('blur', (e) => {
                step.config.conditions[e.target.dataset.idx].val = e.target.value;
                recalculatePipeline();
                renderPipelineSteps();
            }));
            list.querySelectorAll('.btn-del-cond').forEach(el => el.addEventListener('click', (e) => {
                const idx = e.target.closest('button').dataset.idx;
                step.config.conditions.splice(idx, 1);
                recalculatePipeline();
                renderConfigPanel();
                renderPipelineSteps();
            }));
        };

        renderConditions();

        document.getElementById('btn-add-condition').addEventListener('click', () => {
            step.config.conditions.push({ col: availableHeaders[0] || "", op: "CONTAINS", val: "" });
            renderConditions();
        });

        document.getElementById('btn-clear-all').addEventListener('click', () => {
            if (confirm("Xoá tất cả điều kiện lọc?")) {
                step.config.conditions = [];
                recalculatePipeline();
                renderConfigPanel();
                renderPipelineSteps();
            }
        });

        document.querySelectorAll('.btn-logic-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                step.config.logicType = e.target.dataset.logic;
                recalculatePipeline();
                renderConfigPanel();
                renderPipelineSteps();
            });
        });
    }

    /** BƯỚC THÊM CỘT LOGIC (IF / THEN) **/
    else if (step.type === 'CONDITIONAL_COLUMN') {
        dynamicPane.innerHTML = `
            <h3 class="config-title">Xây dựng Logic (IF / THEN)</h3>
            <p class="config-desc" style="margin-bottom:12px;">
                Các quy tắc được kiểm tra <b>từ trên xuống</b>. Hệ thống sẽ lấy kết quả của quy tắc <b>đầu tiên</b> khớp.
            </p>
            
            <div style="background:#f8f9fa; padding:10px; border-radius:6px; border:1px solid #eee; margin-bottom:15px;">
                <div class="logic-row-dense">
                    <span class="logic-keyword kw-if" style="width:90px; flex-shrink:0;">Tên cột mới:</span>
                    <div class="smart-input-container" style="flex:1;">
                        <input type="text" id="cond-new-col" value="${step.config.newColName || ''}" placeholder="VD: Trang_Thai_Don_Hang">
                    </div>
                </div>
            </div>

            <div id="rules-container">
                <!-- Rules rendered here -->
            </div>

            <button class="btn btn-add w-full" id="cond-add-rule-btn" style="height:32px; font-size:12px; margin-top:5px;">+ THÊM QUY TẮC MỚI</button>

            <div class="logic-else-card" style="border-radius:6px; margin-top:20px;">
                <div class="logic-row-dense" style="margin-bottom:6px;">
                    <span class="logic-keyword kw-and-or" style="background:#fff3cd; color:#856404; min-width:80px;">MẶC ĐỊNH</span>
                    <span style="font-size:11px; color:#666;">Nếu không khớp bất kỳ điều kiện nào bên trên:</span>
                </div>
                <div class="logic-row-dense">
                    <span class="logic-keyword kw-then">TRẢ VỀ</span>
                    <div class="smart-input-container" style="flex:1;">
                        ${step.config.elseType === 'COLUMN' 
                            ? `<select id="cond-else-val" style="background:#fff;">${availableHeaders.map(h => `<option value="${h}" ${step.config.elseVal === h ? 'selected' : ''}>${h}</option>`).join('')}</select>` 
                            : `<input type="text" id="cond-else-val" value="${step.config.elseVal || ''}" placeholder="Giá trị mặc định...">`
                        }
                        <div class="toggle-type-btn ${step.config.elseType === 'COLUMN' ? 'active' : ''}" id="toggle-else-type" title="Chuyển đổi: Gõ tay / Lấy từ cột">
                            ${step.config.elseType === 'COLUMN' ? '⊞' : '✎'}
                        </div>
                    </div>
                </div>
            </div>
        `;

        const rulesContainer = document.getElementById('rules-container');
        if (Array.isArray(step.config.rules)) {
            step.config.rules.forEach((rule, rIdx) => {
                const ruleCard = document.createElement('div');
                ruleCard.className = 'logic-card-minimal';

                let condsHTML = rule.conditions.map((c, cIdx) => `
                    <div class="logic-row-dense" style="margin-bottom:4px;">
                        <span class="logic-keyword ${cIdx === 0 ? 'kw-if' : 'kw-and-or'}" data-ridx="${rIdx}" data-cidx="${cIdx}">
                            ${cIdx === 0 
                                ? (rIdx === 0 ? 'NẾU' : 'HOẶC NẾU') 
                                : (c.logic || 'AND')
                            }
                        </span>
                        
                        <div class="smart-input-container logic-item-col">
                            <select class="cond-col" data-ridx="${rIdx}" data-cidx="${cIdx}">
                                ${availableHeaders.map(h => `<option value="${h}" ${c.col === h ? 'selected' : ''}>${h}</option>`).join('')}
                            </select>
                        </div>

                        <div class="smart-input-container logic-item-op">
                            <select class="cond-op" data-ridx="${rIdx}" data-cidx="${cIdx}">
                                <option value="EQUALS" ${c.op === 'EQUALS' ? 'selected' : ''}>=</option>
                                <option value="NOT_EQUALS" ${c.op === 'NOT_EQUALS' ? 'selected' : ''}>!=</option>
                                <option value="GREATER_THAN" ${c.op === 'GREATER_THAN' ? 'selected' : ''}>&gt;</option>
                                <option value="LESS_THAN" ${c.op === 'LESS_THAN' ? 'selected' : ''}>&lt;</option>
                                <option value="CONTAINS" ${c.op === 'CONTAINS' ? 'selected' : ''}>Chứa</option>
                            </select>
                        </div>

                        <div class="smart-input-container logic-item-val">
                            ${c.type === 'COLUMN'
                                ? `<select class="cond-val" data-ridx="${rIdx}" data-cidx="${cIdx}">${availableHeaders.map(h => `<option value="${h}" ${c.val === h ? 'selected' : ''}>${h}</option>`).join('')}</select>`
                                : `<input type="text" class="cond-val" data-ridx="${rIdx}" data-cidx="${cIdx}" value="${c.val || ''}" placeholder="...">`
                            }
                            <div class="toggle-type-btn btn-toggle-cond-type ${c.type === 'COLUMN' ? 'active' : ''}" data-ridx="${rIdx}" data-cidx="${cIdx}">
                                ${c.type === 'COLUMN' ? '⊞' : '✎'}
                            </div>
                        </div>

                        ${rule.conditions.length > 1 
                            ? `<button class="btn-icon btn-del-cond" data-ridx="${rIdx}" data-cidx="${cIdx}" style="width:18px; color:#ccc;">✕</button>` 
                            : ''
                        }
                    </div>
                `).join('');

                ruleCard.innerHTML = `
                    <button class="btn-icon danger logic-delete-btn btn-del-rule" data-ridx="${rIdx}">✕</button>
                    
                    <div style="margin-bottom:8px;">
                        ${condsHTML}
                        <button class="btn-text-only btn-add-cond" data-ridx="${rIdx}" style="margin-left:45px; font-size:10px; padding:0;">+ Thêm điều kiện</button>
                    </div>

                    <div class="logic-row-dense" style="border-top: 1px dashed #eee; padding-top:8px;">
                        <span class="logic-keyword kw-then">TRẢ VỀ</span>
                        <div class="smart-input-container logic-item-val" style="flex:1;">
                            ${rule.thenType === 'COLUMN' 
                                ? `<select class="rule-then-val" data-ridx="${rIdx}">${availableHeaders.map(h => `<option value="${h}" ${rule.thenVal === h ? 'selected' : ''}>${h}</option>`).join('')}</select>`
                                : `<input type="text" class="rule-then-val" data-ridx="${rIdx}" value="${rule.thenVal || ''}" placeholder="Kết quả...">`
                            }
                            <div class="toggle-type-btn btn-toggle-then-type ${rule.thenType === 'COLUMN' ? 'active' : ''}" data-ridx="${rIdx}">
                                ${rule.thenType === 'COLUMN' ? '⊞' : '✎'}
                            </div>
                        </div>
                    </div>
                `;
                rulesContainer.appendChild(ruleCard);
            });
        }

        // --- Event Listeners ---
        document.getElementById('cond-new-col').addEventListener('change', (e) => { 
            step.config.newColName = e.target.value; recalculatePipeline(); 
        });

        document.getElementById('toggle-else-type').addEventListener('click', () => {
            step.config.elseType = step.config.elseType === 'COLUMN' ? 'VALUE' : 'COLUMN';
            renderConfigPanel();
        });

        const elseValEl = document.getElementById('cond-else-val');
        if (elseValEl) {
            elseValEl.addEventListener('change', (e) => {
                step.config.elseVal = e.target.value;
                recalculatePipeline();
            });
        }

        rulesContainer.addEventListener('change', (e) => {
            if (e.target.dataset.ridx === undefined) return;
            const rIdx = parseInt(e.target.dataset.ridx);
            const cIdx = e.target.dataset.cidx !== undefined ? parseInt(e.target.dataset.cidx) : null;
            const rule = step.config.rules[rIdx];

            if (e.target.classList.contains('cond-col')) rule.conditions[cIdx].col = e.target.value;
            if (e.target.classList.contains('cond-op')) rule.conditions[cIdx].op = e.target.value;
            if (e.target.classList.contains('cond-val')) rule.conditions[cIdx].val = e.target.value;
            if (e.target.classList.contains('rule-then-val')) rule.thenVal = e.target.value;

            recalculatePipeline();
        });

        rulesContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('div.toggle-type-btn, button, span.kw-and-or');
            if (!btn) return;
            const rIdx = parseInt(btn.dataset.ridx);
            const cIdx = btn.dataset.cidx !== undefined ? parseInt(btn.dataset.cidx) : null;

            // Toggle AND/OR
            if (btn.classList.contains('kw-and-or')) {
                const cond = step.config.rules[rIdx].conditions[cIdx];
                cond.logic = cond.logic === 'OR' ? 'AND' : 'OR';
                renderConfigPanel();
                recalculatePipeline();
            }

            // Toggle Condition Type (Value/Col)
            if (btn.classList.contains('btn-toggle-cond-type')) {
                const cond = step.config.rules[rIdx].conditions[cIdx];
                cond.type = cond.type === 'COLUMN' ? 'VALUE' : 'COLUMN';
                renderConfigPanel();
            }

            // Toggle Result Type (Value/Col)
            if (btn.classList.contains('btn-toggle-then-type')) {
                const rule = step.config.rules[rIdx];
                rule.thenType = rule.thenType === 'COLUMN' ? 'VALUE' : 'COLUMN';
                renderConfigPanel();
            }

            if (btn.classList.contains('btn-add-cond')) {
                step.config.rules[rIdx].conditions.push({ logic: 'AND', col: availableHeaders[0], op: 'EQUALS', val: '', type: 'VALUE' });
                renderConfigPanel();
            }

            if (btn.classList.contains('btn-del-cond')) {
                step.config.rules[rIdx].conditions.splice(cIdx, 1);
                if (step.config.rules[rIdx].conditions.length === 0) step.config.rules.splice(rIdx, 1);
                renderConfigPanel();
                recalculatePipeline();
            }

            if (btn.classList.contains('btn-del-rule')) {
                step.config.rules.splice(rIdx, 1);
                renderConfigPanel();
                recalculatePipeline();
            }
        });

        document.getElementById('cond-add-rule-btn').addEventListener('click', () => {
            step.config.rules.push({
                conditions: [{ logic: 'AND', col: availableHeaders[0], op: 'EQUALS', val: '', type: 'VALUE' }],
                thenType: 'VALUE',
                thenVal: ''
            });
            renderConfigPanel();
            recalculatePipeline();
        });
    }

    /** BƯỚC MATH COMPUTE (TOÁN HỌC) **/
    else if (step.type === 'MATH_COMPUTE') {
        let colButtonsHTML = availableHeaders.map(h => `<button class="btn btn-outline btn-sm insert-col-btn" style="border: 1px solid var(--border); background: #fafafa; font-size:11px; color:var(--primary); font-weight:600; padding:4px 8px; border-radius:4px; cursor:pointer;" data-col="${h}">[${h}]</button>`).join(' ');

        dynamicPane.innerHTML = `
            <h3 class="config-title">Công Thức Toán Học (+ - * /)</h3>
            <p class="config-desc">Gõ tự do các phép toán phức tạp. Cú pháp: <code>[Tên Cột] * 0.1</code> hoặc <code>([Cột A] + [Cột B]) / 2</code>.</p>

            <div class="row" style="margin-bottom: 16px;">
                <div class="col" style="max-width: 300px;">
                    <label class="form-label">Tên Cột Kết Quả Mới</label>
                    <input type="text" id="math-new-col" class="form-control" value="${step.config.newColName || ''}" placeholder="Cột Đầu Ra">
                </div>
            </div>

            <div class="box-panel" style="max-width:800px;">
                <label class="form-label" style="display:flex; justify-content:space-between;">
                    <span>Nhập Công Thức Toán Học</span>
                    <span style="font-size:11px; color:#888;">(Hỗ trợ phép toán Javascript chuẩn)</span>
                </label>
                <textarea id="math-expr" class="form-control" style="font-family: monospace; font-size: 14px; min-height: 80px;" placeholder="VD: ([Doanh Thu] - [Chi Phi]) * 1.5">${step.config.expression || ''}</textarea>
                
                <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border);">
                    <label class="form-label" style="font-size:11px; margin-bottom:8px;">BẤM ĐỂ CHÈN CỘT VÀO CÔNG THỨC:</label>
                    <div style="display:flex; flex-wrap:wrap; gap: 6px;">
                        ${colButtonsHTML}
                    </div>
                </div>
            </div>
        `;

        document.getElementById('math-new-col').addEventListener('change', (e) => { 
            step.config.newColName = e.target.value; recalculatePipeline(); 
        });
        
        document.getElementById('math-expr').addEventListener('change', (e) => { 
            step.config.expression = e.target.value; recalculatePipeline(); 
        });

        document.querySelectorAll('.insert-col-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const colName = e.target.dataset.col;
                const exprBox = document.getElementById('math-expr');
                
                const startPos = exprBox.selectionStart;
                const endPos = exprBox.selectionEnd;
                const text = exprBox.value;
                const insertedText = '[' + colName + ']';
                
                exprBox.value = text.substring(0, startPos) + insertedText + text.substring(endPos, text.length);
                exprBox.focus();
                exprBox.selectionStart = startPos + insertedText.length;
                exprBox.selectionEnd = startPos + insertedText.length;
                
                step.config.expression = exprBox.value;
                recalculatePipeline();
            });
        });
    }

    else if (step.type === 'GROUP_BY') {
        dynamicPane.innerHTML = `
            <div class="logic-header" style="background:#e8fdf5; padding:12px; border-radius:8px; border:1px solid #d1fae5; margin-bottom:16px;">
                <h3 class="config-title" style="color:#059669; margin:0;">📊 Gộp Data & Tính Toán</h3>
                <p class="config-desc" style="margin-top:4px; font-size:12px;">Gộp các dòng trùng lặp dựa trên một cột mốc.</p>
            </div>

            <div class="box-panel" style="margin-bottom:16px;">
                <label class="form-label" style="font-weight:600; font-size:11px;">1. Cột mốc để Nhóm (Group By)</label>
                <select id="group-col-select" class="form-control">
                    <option value="">-- Chọn cột --</option>
                    ${optHtml}
                </select>
                <p style="font-size:10px; color:#666; margin-top:4px;">Ví dụ: Nhóm theo ID Khách hàng.</p>
            </div>

            <div style="margin-top: 15px;">
                <label class="form-label" style="font-weight:600; font-size:11px;">2. Các phép tính tổng hợp</label>
                <div id="agg-list"></div>
                <button class="btn btn-add w-full" id="btn-add-agg" style="margin-top:12px; height:32px; font-size:12px;">+ THÊM PHÉP TÍNH (SUM, COUNT...)</button>
            </div>
        `;

        const renderAggs = () => {
            const list = document.getElementById('agg-list');
            list.innerHTML = "";
            (step.config.aggregates || []).forEach((agg, idx) => {
                const item = document.createElement('div');
                item.className = 'box-panel agg-item';
                item.style.marginBottom = "8px";
                item.style.padding = "10px";
                item.style.background = "#fafafa";
                item.innerHTML = `
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                        <span style="font-size:10px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Phép tính #${idx+1}</span>
                        <button class="btn-icon btn-del-agg" data-idx="${idx}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                    </div>
                    <div style="display:grid; grid-template-columns:100px 1fr; gap:6px;">
                        <select class="form-control agg-type" data-idx="${idx}">
                            <option value="SUM" ${agg.type === 'SUM' ? 'selected' : ''}>TỔNG (SUM)</option>
                            <option value="COUNT" ${agg.type === 'COUNT' ? 'selected' : ''}>ĐẾM DÒNG</option>
                            <option value="JOIN_STRING" ${agg.type === 'JOIN_STRING' ? 'selected' : ''}>GỘP CHUỖI</option>
                        </select>
                        <select class="form-control agg-col" data-idx="${idx}">
                            <option value="">-- Cột cần tính --</option>
                            ${optHtml}
                        </select>
                    </div>
                `;
                list.appendChild(item);
                if (agg.col) item.querySelector('.agg-col').value = agg.col;
            });

            // Events
            list.querySelectorAll('.agg-type').forEach(el => el.addEventListener('change', (e) => {
                step.config.aggregates[e.target.dataset.idx].type = e.target.value;
                recalculatePipeline();
            }));
            list.querySelectorAll('.agg-col').forEach(el => el.addEventListener('change', (e) => {
                step.config.aggregates[e.target.dataset.idx].col = e.target.value;
                recalculatePipeline();
            }));
            list.querySelectorAll('.btn-del-agg').forEach(el => el.addEventListener('click', (e) => {
                const btnIdx = e.target.closest('button').dataset.idx;
                step.config.aggregates.splice(btnIdx, 1);
                recalculatePipeline();
                renderAggs();
                renderPipelineSteps();
            }));
        };

        if (step.config.groupCol) document.getElementById('group-col-select').value = step.config.groupCol;
        renderAggs();

        document.getElementById('group-col-select').addEventListener('change', (e) => {
            step.config.groupCol = e.target.value;
            recalculatePipeline();
            renderPipelineSteps();
        });

        document.getElementById('btn-add-agg').addEventListener('click', () => {
            if (!step.config.aggregates) step.config.aggregates = [];
            step.config.aggregates.push({ type: "SUM", col: availableHeaders[0] || "" });
            renderAggs();
            recalculatePipeline();
        });
    }

    /** BƯỚC XUẤT VÀ CHỌN CỘT **/
    else if (step.type === 'SELECT_COLUMNS') {
        dynamicPane.innerHTML = `
            <h3 class="config-title">Xào Cột (Select / Rename)</h3>
            <p class="config-desc">Chọn và đổi tên các cột xuất báo cáo. Cột nào không cấu hình ở đây sẽ bị ẩn khi xuất file.</p>
            
            <div id="col-list" style="margin-bottom: 16px;"></div>

            <div class="box-panel row" style="align-items:flex-end;">
                <div class="col">
                    <label class="form-label">Chọn Cột</label>
                    <select id="sel-col" class="form-control"><option value="">-- Chọn --</option>${optHtml}</select>
                </div>
                <div class="col">
                    <label class="form-label">Đổi Tên (Tuỳ chọn)</label>
                    <input type="text" id="sel-new" class="form-control" placeholder="Tên Output Mới">
                </div>
                <button class="btn btn-primary" style="height: 35px;" id="sel-add">Giữ Lại</button>
            </div>
        `;

        const ui = document.getElementById('col-list');
        step.config.columns.forEach((c, idx) => {
            const tag = document.createElement('span'); tag.className = 'filter-tag';
            tag.innerHTML = `${c.oldName} ➔ <b>${c.newName || c.oldName}</b> <button data-idx="${idx}">✕</button>`;
            ui.appendChild(tag);
        });

        ui.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                step.config.columns.splice(e.target.dataset.idx, 1);
                recalculatePipeline();
                renderConfigPanel();
            }
        });

        document.getElementById('sel-add').addEventListener('click', () => {
            const old = document.getElementById('sel-col').value;
            const nName = document.getElementById('sel-new').value;
            if (old) {
                // Kiểm tra trùng lặp
                if (!step.config.columns.find(x => x.oldName === old)) {
                    step.config.columns.push({ oldName: old, newName: nName });
                    recalculatePipeline();
                    renderConfigPanel();
                }
            }
        });
    }

    /** BƯỚC VLOOKUP **/
    else if (step.type === 'VLOOKUP') {
        let vlkSourceOpts = `<option value="UPLOAD">-- 📥 Tải File Excel Mới --</option>`;
        if (AppState.rootFileCache && AppState.rootFileCache.sheetNames.length > 0) {
            vlkSourceOpts = AppState.rootFileCache.sheetNames.map(s => 
                `<option value="${s}">[File Gốc] Tab: ${s}</option>`
            ).join('') + vlkSourceOpts;
        }

        dynamicPane.innerHTML = `
            <h3 class="config-title">Trộn File (Hành động VLOOKUP)</h3>
            <p class="config-desc">Đập thông tin từ phân vùng phụ sang luồng chính. Có thể lấy ngay Sheet trong File Gốc.</p>
            
            <div class="box-panel" style="margin-bottom: 16px;">
                <label class="form-label" style="font-weight:600;">Chọn Nguồn Đối Chiếu (Data 2)</label>
                <select id="vlk-source-select" class="form-control" style="width:100%; margin-top:4px;">
                    <option value="">-- Chọn Nguồn --</option>
                    ${vlkSourceOpts}
                </select>
                
                <div id="vlk-upload-area" style="display:none; margin-top:10px; padding-top:10px; border-top:1px dashed #ccc;">
                    <button class="btn btn-outline" id="btn-vlookup-file">📥 Bấm Tải File Tên Khác Lên</button>
                    <input type="file" id="vlookup-file" accept=".xlsx,.xls,.csv" hidden>
                </div>
                
                <p id="vlk-filename" style="margin-top: 10px; font-size: 13px; color: var(--success); font-weight:600;">
                    ${step.config.lookupData ? `✓ Bộ nhớ Mapping đã Sẵn Sàng (Sức chứa: ${step.config.lookupData.length.toLocaleString()} dòng)` : "❌ Nguồn Data phụ trống"}
                </p>
            </div>
            
            <div class="row" style="margin-bottom: 16px;">
                <div class="col">
                     <label class="form-label" style="display:inline-block; margin-right:10px;">Phương pháp Join</label>
                     <select id="vlk-join" class="form-control" style="width:220px; display:inline-block; padding: 6px;">
                        <option value="LEFT">Left Join (Gắn thêm cột)</option>
                        <option value="INNER">Inner Join (Chỉ lấy dòng Khớp)</option>
                        <option value="ANTI">Anti Join (Chỉ lấy dòng Trật)</option>
                     </select>
                </div>
            </div>

            <div id="vlookup-config-area" class="${step.config.lookupData ? '' : 'hidden'}">
                <div class="row" style="align-items:flex-end;">
                    <div class="col">
                        <label class="form-label">Cột Key Bảng CHÍNH</label>
                        <select id="vlk-base" class="form-control"><option value="">-- Chọn --</option>${optHtml}</select>
                    </div>
                    <div class="col">
                        <label class="form-label">Cột Key Bảng PHỤ</label>
                        <select id="vlk-secondary" class="form-control"><option value="">-- Chọn --</option></select>
                    </div>
                </div>

                <div style="margin-top: 16px;">
                    <hr style="opacity: 0.2; margin-bottom: 12px;" />
                    <div class="row" style="align-items:flex-end;">
                        <div class="col" style="max-width: 350px;">
                            <label class="form-label" style="display:flex; align-items:center; gap: 8px; cursor:pointer; color:var(--primary);">
                                <input type="checkbox" id="vlk-flag-check" ${step.config.enableFlag ? 'checked' : ''} style="width:16px;height:16px; cursor:pointer;">
                                <span>Sinh cột đánh dấu Khớp (Có/Không)?</span>
                            </label>
                            <input type="text" id="vlk-flag-col" class="form-control" style="margin-top:8px; ${step.config.enableFlag ? 'display:block;' : 'display:none;'}" placeholder="Nhập tên cột (Mặc định: Trang_Thai_Khop)" value="${step.config.flagColName || ''}">
                        </div>
                    </div>
                </div>

                <div style="margin-top: 16px;">
                    <hr style="opacity: 0.2; margin-bottom: 12px;" />
                    <label class="form-label">Các Giỏ / Cột phụ rinh sang Bảng chính:</label>
                    <div id="vlk-grab-list" style="margin-bottom: 8px;"></div>
                    <div class="row" style="align-items:flex-end;">
                        <div class="col" style="max-width:250px;">
                            <select id="vlk-grab-col" class="form-control"><option value="">-- Cột Lấy --</option></select>
                        </div>
                        <button class="btn btn-primary" style="height: 40px; margin-bottom: 2px;" id="vlk-grab-add">Kéo sang</button>
                    </div>
                </div>
            </div>
        `;

        if (step.config.lookupData) {
            document.getElementById('vlk-join').value = step.config.joinType || "LEFT";
            if (step.config.baseKey) document.getElementById('vlk-base').value = step.config.baseKey;
            
            // Populate secondary drops
            const hSec = step.config.lookupData.length > 0 ? Object.keys(step.config.lookupData[0]) : [];
            const hp = hSec.map(h => `<option value="${h}">${h}</option>`).join('');
            
            const dropSec = document.getElementById('vlk-secondary');
            dropSec.innerHTML = `<option value="">-- Chọn --</option>${hp}`;
            if (step.config.lookupKey) dropSec.value = step.config.lookupKey;

            const grabCol = document.getElementById('vlk-grab-col');
            grabCol.innerHTML = `<option value="">-- Chọn --</option>${hp}`;

            // List grab actions
            const gbList = document.getElementById('vlk-grab-list');
            step.config.grabColumns.forEach((c, idx) => {
                const tag = document.createElement('span'); tag.className = 'filter-tag';
                tag.innerHTML = `Lấy [${c}] <button data-idx="${idx}">✕</button>`;
                gbList.appendChild(tag);
            });

            gbList.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON') {
                    step.config.grabColumns.splice(e.target.dataset.idx, 1);
                    recalculatePipeline();
                    renderConfigPanel();
                }
            });

            document.getElementById('vlk-grab-add').addEventListener('click', () => {
                const val = document.getElementById('vlk-grab-col').value;
                if (val && !step.config.grabColumns.includes(val)) {
                    step.config.grabColumns.push(val);
                    recalculatePipeline();
                    renderConfigPanel();
                }
            });
            
            // Events config changes
            document.getElementById('vlk-join').addEventListener('change', (e) => { step.config.joinType = e.target.value; recalculatePipeline(); });
            document.getElementById('vlk-base').addEventListener('change', (e) => { step.config.baseKey = e.target.value; recalculatePipeline(); });
            document.getElementById('vlk-secondary').addEventListener('change', (e) => { step.config.lookupKey = e.target.value; recalculatePipeline(); });
            
            document.getElementById('vlk-flag-check').addEventListener('change', (e) => { 
                step.config.enableFlag = e.target.checked; 
                document.getElementById('vlk-flag-col').style.display = e.target.checked ? 'block' : 'none';
                if (e.target.checked && !step.config.flagColName) {
                    step.config.flagColName = "Trang_Thai_Khop";
                    document.getElementById('vlk-flag-col').value = step.config.flagColName;
                }
                recalculatePipeline(); 
            });
            document.getElementById('vlk-flag-col').addEventListener('change', (e) => { step.config.flagColName = e.target.value; recalculatePipeline(); });
        }

        // --- CẤU HÌNH EVENT TẢI NGUỒN DATA VLOOKUP ---
        const sourceSelect = document.getElementById('vlk-source-select');
        const uploadArea = document.getElementById('vlk-upload-area');
        
        sourceSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val === 'UPLOAD') {
                uploadArea.style.display = 'block';
            } else if (val) {
                uploadArea.style.display = 'none';
                step.config.lookupData = AppState.rootFileCache.sheetsData[val].data;
                step.config.grabColumns = []; // Reset cấu hình
                document.getElementById('vlk-filename').innerText = `Thành công! Đã bốc data từ Tab: ${val}`;
                recalculatePipeline();
                renderConfigPanel();
            } else {
                uploadArea.style.display = 'none';
            }
        });

        // File upload vlookup cứng truyền thống
        document.getElementById('btn-vlookup-file').addEventListener('click', () => document.getElementById('vlookup-file').click());
        document.getElementById('vlookup-file').addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                document.getElementById('global-loading').classList.remove('hidden');
                document.getElementById('global-loading-text').innerText = "Đang rải file Index cho VLOOKUP...";
                try {
                    const result = await readExcelFile(e.target.files[0]);
                    // Tự động bốc sheet đầu tiên nếu tải file bên ngoài
                    const sName = result.sheetNames[0];
                    step.config.lookupData = result.sheetsData[sName].data; 
                    document.getElementById('vlk-filename').innerText = "Thành công!";
                    renderConfigPanel(); // Reload panel để bung hộp thoại
                } catch(e) {
                    alert("Lỗi đọc File Map: " + e.message);
                } finally {
                    document.getElementById('global-loading').classList.add('hidden');
                }
            }
        });
    }
    
    /** BƯỚC SO SÁNH (COMPARE) **/
    else if (step.type === 'COMPARE') {
        let cmpSourceOpts = `<option value="UPLOAD">-- 📥 Tải File Excel Mới --</option>`;
        if (AppState.rootFileCache && AppState.rootFileCache.sheetNames.length > 0) {
            cmpSourceOpts = AppState.rootFileCache.sheetNames.map(s => 
                `<option value="${s}">[File Gốc] Tab: ${s}</option>`
            ).join('') + cmpSourceOpts;
        }

        dynamicPane.innerHTML = `
            <h3 class="config-title">So Sánh 2 File</h3>
            <p class="config-desc">So sánh biến động giá trị giữa luồng hiện tại và dữ liệu file mới.</p>
            
            <div class="box-panel" style="margin-bottom: 16px;">
                <label class="form-label" style="font-weight:600;">Chọn Nguồn Đối Chiếu (File Sau)</label>
                <select id="cmp-source-select" class="form-control" style="width:100%; margin-top:4px;">
                    <option value="">-- Chọn Nguồn --</option>
                    ${cmpSourceOpts}
                </select>
                
                <div id="cmp-upload-area" style="display:none; margin-top:10px; padding-top:10px; border-top:1px dashed #ccc;">
                    <button class="btn btn-outline" id="btn-compare-file">📥 Bấm Tải File Đối Chiếu Lên</button>
                    <input type="file" id="compare-file" accept=".xlsx,.xls,.csv" hidden>
                </div>
                
                <p id="cmp-filename" style="margin-top: 10px; font-size: 13px; color: var(--success); font-weight:600;">
                    ${step.config.compareData ? `✓ Đã nạp dữ liệu so sánh (${step.config.compareData.length.toLocaleString()} dòng)` : "❌ Chưa có dữ liệu so sánh"}
                </p>
            </div>

            <div id="compare-config-area" class="${step.config.compareData ? '' : 'hidden'}">
                <div class="row" style="align-items:flex-end;">
                    <div class="col">
                        <label class="form-label">Cột Mốc Bảng HIỆN TẠI</label>
                        <select id="cmp-base-key" class="form-control"><option value="">-- Chọn Khóa --</option>${optHtml}</select>
                    </div>
                    <div class="col">
                        <label class="form-label">Cột Mốc File So Sánh</label>
                        <select id="cmp-sec-key" class="form-control"><option value="">-- Chọn Khóa --</option></select>
                    </div>
                </div>

                <div class="row" style="align-items:flex-end; margin-top: 10px;">
                    <div class="col">
                        <label class="form-label">Cột Gía Trị HIỆN TẠI</label>
                        <select id="cmp-base-col" class="form-control"><option value="">-- Cột Tiền (Trước) --</option>${optHtml}</select>
                    </div>
                    <div class="col">
                        <label class="form-label">Cột Gía Trị MỚI</label>
                        <select id="cmp-sec-col" class="form-control"><option value="">-- Cột Tiền (Sau) --</option></select>
                    </div>
                </div>

                <div style="margin-top: 16px;">
                    <hr style="opacity: 0.2; margin-bottom: 12px;" />
                    <label class="form-label" style="font-weight:600;">Điều kiện lọc biến động</label>
                    <div class="row" style="margin-top:4px;">
                        <div class="col">
                            <select id="cmp-condition-type" class="form-control">
                                <option value="THRESHOLD_INC" ${step.config.conditionType === 'THRESHOLD_INC' ? 'selected' : ''}>Tăng (>= Ngưỡng)</option>
                                <option value="THRESHOLD_DEC" ${step.config.conditionType === 'THRESHOLD_DEC' ? 'selected' : ''}>Giảm (>= Ngưỡng nhập)</option>
                                <option value="TOP_X_INC" ${step.config.conditionType === 'TOP_X_INC' ? 'selected' : ''}>Lấy Top X tăng nhiều nhất</option>
                                <option value="TOP_X_DEC" ${step.config.conditionType === 'TOP_X_DEC' ? 'selected' : ''}>Lấy Top X giảm nhiều nhất</option>
                                <option value="THRESHOLD" ${step.config.conditionType === 'THRESHOLD' ? 'selected' : ''}>Biến động tuyệt đối (Cũ)</option>
                            </select>
                        </div>
                    </div>
                    <div class="row" style="margin-top:8px;" id="cmp-cond-input-wrap">
                        <div class="col">
                            <input type="number" id="cmp-threshold-val" class="form-control" style="${(!step.config.conditionType || step.config.conditionType.startsWith('THRESHOLD')) ? '' : 'display:none;'}" placeholder="Nhập ngưỡng (VD: 50000000)" value="${step.config.diffThreshold}">
                            <input type="number" id="cmp-topx-val" class="form-control" style="${(step.config.conditionType && step.config.conditionType.startsWith('TOP_X')) ? '' : 'display:none;'}" placeholder="Nhập số X (VD: 30)" value="${step.config.topXValue}">
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Render bindings
        if (step.config.compareData) {
            if (step.config.baseKey) document.getElementById('cmp-base-key').value = step.config.baseKey;
            if (step.config.baseCompareCol) document.getElementById('cmp-base-col').value = step.config.baseCompareCol;
            
            const hSec = step.config.compareData.length > 0 ? Object.keys(step.config.compareData[0]) : [];
            const hp = hSec.map(h => `<option value="${h}">${h}</option>`).join('');
            
            const dKey = document.getElementById('cmp-sec-key');
            dKey.innerHTML = `<option value="">-- Chọn Khóa --</option>${hp}`;
            if (step.config.compareKey) dKey.value = step.config.compareKey;

            const dCol = document.getElementById('cmp-sec-col');
            dCol.innerHTML = `<option value="">-- Cột Tiền (Sau) --</option>${hp}`;
            if (step.config.secondaryCompareCol) dCol.value = step.config.secondaryCompareCol;
            
            // Events
            document.getElementById('cmp-base-key').addEventListener('change', (e) => { step.config.baseKey = e.target.value; recalculatePipeline(); });
            document.getElementById('cmp-sec-key').addEventListener('change', (e) => { step.config.compareKey = e.target.value; recalculatePipeline(); });
            document.getElementById('cmp-base-col').addEventListener('change', (e) => { step.config.baseCompareCol = e.target.value; recalculatePipeline(); });
            document.getElementById('cmp-sec-col').addEventListener('change', (e) => { step.config.secondaryCompareCol = e.target.value; recalculatePipeline(); });

            document.getElementById('cmp-condition-type').addEventListener('change', (e) => {
                step.config.conditionType = e.target.value;
                document.getElementById('cmp-threshold-val').style.display = e.target.value.startsWith('THRESHOLD') ? 'block' : 'none';
                document.getElementById('cmp-topx-val').style.display = e.target.value.startsWith('TOP_X') ? 'block' : 'none';
                recalculatePipeline();
            });

            document.getElementById('cmp-threshold-val').addEventListener('change', (e) => { step.config.diffThreshold = Number(e.target.value); recalculatePipeline(); });
            document.getElementById('cmp-topx-val').addEventListener('change', (e) => { step.config.topXValue = Number(e.target.value); recalculatePipeline(); });
        }

        // Upload Events
        const cmpSourceSelect = document.getElementById('cmp-source-select');
        const cmpUploadArea = document.getElementById('cmp-upload-area');
        
        cmpSourceSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val === 'UPLOAD') {
                cmpUploadArea.style.display = 'block';
            } else if (val) {
                cmpUploadArea.style.display = 'none';
                step.config.compareData = AppState.rootFileCache.sheetsData[val].data;
                document.getElementById('cmp-filename').innerText = `Thành công! Đã bốc data từ Tab: ${val}`;
                recalculatePipeline();
                renderConfigPanel();
            } else {
                cmpUploadArea.style.display = 'none';
            }
        });

        document.getElementById('btn-compare-file').addEventListener('click', () => document.getElementById('compare-file').click());
        document.getElementById('compare-file').addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                document.getElementById('global-loading').classList.remove('hidden');
                document.getElementById('global-loading-text').innerText = "Đang rải file Index cho chức năng So Sánh...";
                try {
                    const result = await readExcelFile(e.target.files[0]);
                    const sName = result.sheetNames[0];
                    step.config.compareData = result.sheetsData[sName].data; 
                    document.getElementById('cmp-filename').innerText = "Thành công nạp file phụ!";
                    renderConfigPanel();
                } catch(e) {
                    alert("Lỗi đọc File So Sánh: " + e.message);
                } finally {
                    document.getElementById('global-loading').classList.add('hidden');
                }
            }
        });
    }
}

// XUẤT OUTPUT (FINAL EXPORT)
document.getElementById('btn-export-final').addEventListener('click', () => {
    // Luôn luôn xuất ra mảng kết quả của bước CHÓT
    let finalData = [];
    if (AppState.steps.length > 0) {
        finalData = AppState.cachedResults.get(AppState.steps[AppState.steps.length - 1].id) || [];
    } else {
        finalData = AppState.cachedResults.get('ROOT') || [];
    }

    if (finalData.length === 0) {
        alert("Bảng dữ liệu đang trống, không có gì để xuất.");
        return;
    }

    document.getElementById('global-loading').classList.remove('hidden');
    document.getElementById('global-loading-text').innerText = "Đang trích xuất toàn bộ dữ liệu...";
    
    setTimeout(async () => {
        try {
             await exportPipelineResult(finalData, `DataX_Output_${Date.now()}.xlsx`);
        } catch(e) {
            alert("Lỗi xuất file: " + e.message);
        } finally {
            document.getElementById('global-loading').classList.add('hidden');
        }
    }, 100);
});

// INITIALIZE
renderPipelineSteps();
