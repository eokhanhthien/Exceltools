/* BỘ ĐIỀU KHIỂN UI - STUDIO PIPELINE */

// --- STATE QUẢN LÝ ---
const AppState = {
    rootFileCache: null,    // Cache toàn bộ các Sheet của File Gốc { fileName, workbook, sheetNames, sheetsData }
    rootSelectedSheet: "",  // Tên Sheet đang dùng làm mốc
    rootHeaderRowIndex: 0,  // Dòng bắt đầu làm tiêu đề (0-indexed)
    rootData: [],           // Dữ liệu gốc ở node LOAD
    rootHeaders: [],        // Tiêu đề cột gốc
    steps: [],              // Danh sách các bước
    activeStepId: null,     // Bước đang bấm vào để edit
    cachedResults: new Map() // ID Bước -> Dữ liệu đầu ra của bước đó (Tối ưu RAM)
};

// --- AUTO-SAVE (LOCAL STORAGE) ---
function saveStateToLocal() {
    try {
        const exportSteps = AppState.steps.map(s => {
            let clone = JSON.parse(JSON.stringify(s));
            // Xoá data nặng để tránh tràn 5MB limit của localStorage
            if (clone.type === 'VLOOKUP' && clone.config.lookupData) clone.config.lookupData = null;
            if (clone.type === 'COMPARE' && clone.config.compareData) clone.config.compareData = null;
            return clone;
        });
        localStorage.setItem('DataX_AutoSave_Steps', JSON.stringify(exportSteps));
    } catch (e) {
        console.warn("Auto-save failed:", e);
    }
}

function loadStateFromLocal() {
    try {
        const saved = localStorage.getItem('DataX_AutoSave_Steps');
        if (saved) {
            const steps = JSON.parse(saved);
            if (Array.isArray(steps) && steps.length > 0) {
                AppState.steps = steps;
            }
        }
    } catch(e) {
        console.warn("Khôi phục Auto-Save thất bại:", e);
    }
}

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
    else if (type === 'FORMULA_BUILDER') { title = "Công Thức Excel"; config = { newColName: '', formula: '' }; }

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
                <div class="step-desc">${AppState.rootHeaders.length ? AppState.rootTotalRows.toLocaleString() + ' dòng dữ liệu' + (AppState.rootTotalRows > AppState.rootData.length ? ' (Đang xem trước)' : '') : 'Chưa tải file'}</div>
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
            
            const clickedId = node.dataset.id;
            
            // Nếu click vào step đang active -> Toggle (Đóng panel)
            if (AppState.activeStepId === clickedId) {
                if (typeof window._closeConfigPanel === 'function') {
                    window._closeConfigPanel();
                }
                return;
            }

            // Nếu click step khác -> Mở panel cấu hình của step đó
            AppState.activeStepId = clickedId;
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
    if (step.type === 'FORMULA_BUILDER') return step.config.formula ? `→ cột "${step.config.newColName || '?'}" | ${step.config.formula.substring(0,28)}...` : 'Chưa có công thức';
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
    if (!AppState.rootFileCache || !AppState.rootFileCache.workerApi) return;
    
    document.getElementById('preview-mini-loading').classList.remove('hidden');
    
    const pipelineContainer = document.getElementById('pipeline-steps');
    if (pipelineContainer && !silent) pipelineContainer.classList.add('is-calculating');
    
    try {
        const fullData = AppState.rootFileCache.sheetsData[AppState.rootSelectedSheet].fullData;
        
        // Gọi Worker chạy Pipeline trên TOÀN BỘ dữ liệu để đảm bảo chính xác 100%
        const result = await AppState.rootFileCache.workerApi.runPipeline(AppState.steps, fullData);
        
        // Cập nhật Cache kết quả (dùng cho Preview)
        // Lưu ý: Worker trả về previewData (1000 dòng đầu của kết quả cuối cùng)
        // Chúng ta cần lưu kết quả trung gian nếu muốn preview từng bước, 
        // nhưng để đơn giản và chính xác tuyệt đối cho bước hiện tại:
        AppState.cachedResults.set(AppState.activeStepId, result.previewData);
        
        // Nếu muốn xem preview của CÁC bước trước đó, ta có thể cần chạy lại pipeline từng phần
        // Tuy nhiên thường người dùng quan tâm kết quả tại bước đang đứng.
        
        console.log(`Pipeline Sync: ${result.totalRows} dòng kết quả.`);
        
        saveStateToLocal(); // Tự động lưu thiết lập pipeline
        renderPipelineSteps(); // Cập nhật Mô tả
        renderPreviewAtActiveStep();
    } catch (err) {
        console.error("Lỗi Pipeline Worker:", err);
    } finally {
        document.getElementById('preview-mini-loading').classList.add('hidden');
        if (pipelineContainer) {
            setTimeout(() => pipelineContainer.classList.remove('is-calculating'), 400);
        }
    }
}

// --- QUẢN LÝ KỊCH BẢN (PRESET: SAVE / LOAD) ---
if (document.getElementById('btn-export-preset')) {

    // === LƯU KỊCH BẢN: Chỉ Cấu Hình (Nhẹ) ===
    document.getElementById('btn-export-preset').addEventListener('click', () => {
        if (AppState.steps.length === 0) {
            alert("Chưa có bước Pipeline nào để xuất Kịch bản!");
            return;
        }
        // Clone và dọn dẹp data nặng trước khi xuất
        const exportSteps = AppState.steps.map(s => {
            let clone = JSON.parse(JSON.stringify(s));
            if (clone.type === 'VLOOKUP' && clone.config.lookupData) clone.config.lookupData = null;
            if (clone.type === 'COMPARE' && clone.config.compareData) clone.config.compareData = null;
            return clone;
        });

        const payload = { version: 2, mode: 'config_only', steps: exportSteps };
        _downloadJson(payload, `DataX_Preset_${_dateStr()}.json`);
    });

    // === LƯU KỊCH BẢN ĐẦY ĐỦ: Kèm Toàn Bộ Data Phụ ===
    document.getElementById('btn-export-preset-full').addEventListener('click', () => {
        if (AppState.steps.length === 0) {
            alert("Chưa có bước Pipeline nào để xuất Kịch bản!");
            return;
        }

        const hasHeavy = AppState.steps.some(s =>
            (s.type === 'VLOOKUP' && s.config.lookupData) ||
            (s.type === 'COMPARE' && s.config.compareData)
        );

        if (!hasHeavy) {
            alert("Không phát hiện data phụ (VLOOKUP / So Sánh) để lưu kèm.\n\nHãy dùng nút Lưu Thường, hoặc nạp data phụ vào pipeline trước.");
            return;
        }

        if (!confirm("Lưu kịch bản ĐẦY ĐỦ sẽ nhúng tất cả dữ liệu bảng phụ (VLOOKUP/Compare) vào file JSON.\n\nFile có thể nặng nếu data lớn, nhưng khi mở lại sẽ auto sẵn sàng, không cần tải lại file phụ.\n\nTiếp tục?")) return;

        // Giữ nguyên toàn bộ data (bao gồm lookupData và compareData)
        const exportSteps = AppState.steps.map(s => JSON.parse(JSON.stringify(s)));

        const payload = { version: 2, mode: 'full_data', steps: exportSteps };
        _downloadJson(payload, `DataX_Preset_FULL_${_dateStr()}.json`);
        alert(`✅ Đã lưu kịch bản đầy đủ!\n\nKhi mở lại file này, chỉ cần áp file Excel chính là pipeline chạy ngay, không cần nạp lại file phụ.`);
    });

    // === NẠP KỊCH BẢN ===
    document.getElementById('btn-import-preset').addEventListener('click', () => {
        document.getElementById('preset-file-input').click();
    });

    document.getElementById('preset-file-input').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const parsed = JSON.parse(evt.target.result);

                    // Hỗ trợ cả 2 định dạng: cũ (Array) và mới (Object có version)
                    let stepsObj;
                    let mode = 'config_only';

                    if (Array.isArray(parsed)) {
                        // Định dạng cũ: array trực tiếp
                        stepsObj = parsed;
                    } else if (parsed.version === 2 && Array.isArray(parsed.steps)) {
                        stepsObj = parsed.steps;
                        mode = parsed.mode || 'config_only';
                    } else {
                        alert("File Kịch Bản không đúng định dạng chuẩn của DataX!");
                        return;
                    }

                    AppState.steps = stepsObj;
                    AppState.activeStepId = stepsObj.length > 0 ? stepsObj[0].id : 'ROOT';
                    renderPipelineSteps();
                    renderConfigPanel();
                    recalculatePipeline();

                    if (mode === 'full_data') {
                        // Đếm các bước đã có data kèm
                        const loadedCount = stepsObj.filter(s =>
                            (s.type === 'VLOOKUP' && s.config.lookupData) ||
                            (s.type === 'COMPARE' && s.config.compareData)
                        ).length;
                        alert(`✅ Đã nạp Kịch bản ĐẦY ĐỦ!\n\n${loadedCount} bước đã có sẵn data phụ.\nChỉ cần áp file Excel chính là pipeline sẽ chạy ngay!`);
                    } else {
                        alert("✅ Đã nạp Kịch bản cấu hình!\n\nNếu pipeline có bước VLOOKUP hoặc So Sánh, hãy nạp lại file phụ tương ứng.");
                    }
                } catch (err) {
                    alert("Lỗi đọc File Kịch Bản: " + err.message);
                }
            };
            reader.readAsText(file);
            e.target.value = ''; // Reset để cho phép import lại cùng 1 file
        }
    });
}

// Hàm tiện ích: Tải JSON xuống máy
function _downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Hàm tiện ích: Tạo chuỗi ngày cho tên file
function _dateStr() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}_${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`;
}

// Hàm tiện ích: Chuyển index (0-based) sang ký hiệu cột Excel (A, B, ..., Z, AA, AB, ...)
function _colLetter(n) {
    let s = '';
    n += 1; // 1-based
    while (n > 0) {
        const r = (n - 1) % 26;
        s = String.fromCharCode(65 + r) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
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

// =============================================
// RENDER DATA TABLE — Giống test.html, không cần thư viện
// =============================================

// Cache dữ liệu đang hiển thị để search filter hoạt động
let _currentRenderData = [];
let _currentHeaders = [];

// Hàm render table (tách riêng để search gọi lại được)
function _renderTableRows(data, headers) {
    const tbody = document.getElementById('data-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${headers.length || 1}" style="text-align:center;padding:40px;color:#9ca3af;">Không có dữ liệu</td></tr>`;
        return;
    }

    const isRoot = AppState.activeStepId === 'ROOT';
    const limit = Math.min(1000, data.length);

    for (let i = 0; i < limit; i++) {
        const row = data[i];
        const tr = document.createElement('tr');

        headers.forEach(h => {
            const td = document.createElement('td');
            const val = (row[h] !== undefined && row[h] !== null) ? String(row[h]) : '';
            td.innerText = val;

            // Cho phép edit trực tiếp ở ROOT (giống test.html)
            if (isRoot) {
                td.contentEditable = true;
                td.addEventListener('blur', function () {
                    row[h] = td.innerText;
                    // Cập nhật lại fullData trong cache
                    if (AppState.rootFileCache && AppState.rootSelectedSheet) {
                        const sd = AppState.rootFileCache.sheetsData[AppState.rootSelectedSheet];
                        if (sd) {
                            const idx = AppState.rootData.indexOf(row);
                            if (idx >= 0 && sd.fullData) sd.fullData[idx] = row;
                        }
                    }
                    setTimeout(() => recalculatePipeline(), 50);
                });
            }

            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    }
}

// Khởi tạo search
function _initTableSearch() {
    const input = document.getElementById('table-search');
    if (!input || input.dataset.bound) return;
    input.dataset.bound = '1';
    input.addEventListener('input', function () {
        const kw = this.value.toLowerCase().trim();
        if (!kw) {
            _renderTableRows(_currentRenderData, _currentHeaders);
            return;
        }
        const filtered = _currentRenderData.filter(row =>
            _currentHeaders.some(h => String(row[h] ?? '').toLowerCase().includes(kw))
        );
        _renderTableRows(filtered, _currentHeaders);
    });
}

function renderPreviewAtActiveStep() {
    const activeData = AppState.cachedResults.get(AppState.activeStepId);
    let renderData = (activeData && activeData.length > 0) ? activeData : [];
    const headers = renderData.length > 0
        ? Object.keys(renderData[0]).filter(k => k !== '__original_row_idx__')
        : getHeadersAtCurrentStep().filter(k => k !== '__original_row_idx__');

    // Lưu cache để search dùng lại
    _currentRenderData = renderData;
    _currentHeaders = headers;

    // Reset search input
    const searchEl = document.getElementById('table-search');
    if (searchEl) searchEl.value = '';

    // Build THEAD
    const thead = document.getElementById('data-thead');
    if (thead) {
        thead.innerHTML = '';
        const tr = document.createElement('tr');
        headers.forEach(h => {
            const th = document.createElement('th');
            th.innerText = h;
            tr.appendChild(th);
        });
        thead.appendChild(tr);
    }

    // Render rows
    _renderTableRows(renderData, headers);

    // Gắn search (chỉ lần đầu)
    _initTableSearch();

    // Cập nhật badges thống kê
    let displayText = `${renderData.length.toLocaleString()} dòng`;
    if (renderData.length >= 1000) displayText += ` (xem trước — xuất sẽ FULL)`;
    const rowCountEl = document.getElementById('preview-row-count');
    const colCountEl = document.getElementById('preview-col-count');
    if (rowCountEl) rowCountEl.innerText = displayText;
    if (colCountEl) colCountEl.innerText = `${headers.length} cột`;
}


// --- CONFIG PANEL RENDERING (Giao diện cấu hình động) ---
function renderConfigPanel() {
    const emptyState = document.getElementById('config-empty');
    const dynamicPane = document.getElementById('config-dynamic');
    const panel       = document.getElementById('config-panel');

    dynamicPane.innerHTML = "";
    if (!AppState.activeStepId) {
        emptyState.classList.remove('hidden');
        dynamicPane.classList.add('hidden');
        panel && panel.classList.remove('open'); // Ẩn panel khi không có step
        return;
    }

    // Mở panel
    if (panel) panel.classList.add('open');
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
        }

        dynamicPane.innerHTML = `
            <h3 class="config-title">Nguồn Dữ Liệu Gốc</h3>
            <p class="config-desc">Nạp dữ liệu qua <b>SheetJS (XLSX.js)</b>. Đọc trực tiếp encoding từ metadata file, không lỗi font.</p>
            <div class="pipeline-dropzone" id="root-dropzone">
                <div style="font-size: 24px; color: var(--primary);">📥</div>
                <div style="margin-top: 5px; font-weight: 500;">Bấm tải lên hoặc Kéo File vào đây</div>
                <input type="file" id="root-file-input" accept=".xlsx,.xls,.csv" hidden />
            </div>
            ${AppState.rootData.length > 0 ? `<p style="margin-top: 15px; color: var(--success); font-weight: bold;">✅ OK: ${AppState.rootData.length.toLocaleString()} dòng</p>` : ''}
            ${rootSheetSelectorHtml}
            ${rootHeaderRowHtml}
        `;

        const triggerReparse = () => {
            if (AppState.rootFileCache) {
                const sheetName = AppState.rootSelectedSheet;
                const result = extractSheetData(
                    AppState.rootFileCache.originalBuffer,
                    sheetName,
                    AppState.rootHeaderRowIndex
                );
                AppState.rootData = result.data;
                AppState.rootHeaders = result.headers;
                if (AppState.rootFileCache.sheetsData[sheetName]) {
                    AppState.rootFileCache.sheetsData[sheetName].fullData = result.fullData;
                    AppState.rootTotalRows = result.totalRows;
                }
                recalculatePipeline();
                renderPreviewAtActiveStep();
                renderPipelineSteps();
            }
        };

        if (document.getElementById('root-sheet-select')) {
            document.getElementById('root-sheet-select').addEventListener('change', (e) => {
                AppState.rootSelectedSheet = e.target.value;
                triggerReparse();
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
                    // Cần huỷ worker cũ nếu đã từng tải file trước đó để tránh tràn RAM
                    if (AppState.rootFileCache && AppState.rootFileCache.workerApi) {
                        AppState.rootFileCache.workerApi.terminate();
                    }

                    const result = await readExcelFile(e.target.files[0]);
                    AppState.rootFileCache = result;
                    AppState.rootSelectedSheet = result.sheetNames[0];
                    AppState.rootHeaderRowIndex = 0;
                    
                    // Lấy data từ sheet đầu tiên
                    const sheetData = result.sheetsData[AppState.rootSelectedSheet];
                    AppState.rootData = sheetData.data;
                    AppState.rootHeaders = sheetData.headers;
                    AppState.rootTotalRows = sheetData.totalRows || sheetData.data.length;

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
    const optHtml = availableHeaders.map((h, i) => `<option value="${h}">${_colLetter(i)}: ${h}</option>`).join('');

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
                    // VLOOKUP cần nạp FULL data để không bị sót map
                    const result = await readExcelFile(e.target.files[0], null);
                    // Tự động bốc sheet đầu tiên nếu tải file bên ngoài
                    const sName = result.sheetNames[0];
                    step.config.lookupData = result.sheetsData[sName].data; 
                    
                    // Giải phóng Worker ngay lập tức vì VLOOKUP/COMPARE file ngoài chỉ cần đọc 1 lần
                    if (result.workerApi) result.workerApi.terminate();
                    
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
    /** BƯỚC XÂY CÔNG THỨC KÉO THẢ **/
    else if (step.type === 'FORMULA_BUILDER') {
        const sampleRow = AppState.rootData[0] || {};
        const fbHeaders = availableHeaders;
        const FN_CATS = [
            { cat: '⚙️ Điều kiện', color: '#7c3aed', fns: [
                { n: 'IF',      tpl: 'IF(DK, "neu dung", "neu sai")',                      d: 'Nếu điều kiện → đúng/sai' },
                { n: 'IFS',     tpl: 'IFS(DK1,"ket1", DK2,"ket2", "mac dinh")',           d: 'Nhiều điều kiện liên tiếp' },
                { n: 'IFERROR', tpl: 'IFERROR(BIEU_THUC, "Loi")',                          d: 'Bắt lỗi, trả giá trị thay thế' },
                { n: 'IFBLANK', tpl: 'IFBLANK(COT, "Trong")',                              d: 'Nếu rỗng thì trả giá trị thay thế' },
                { n: 'SWITCH',  tpl: 'SWITCH(COT, "A","Loai 1", "B","Loai 2", "Khac")',   d: 'Khớp theo giá trị (giống CHOOSE)' },
            ]},
            { cat: '📝 Chuỗi văn bản', color: '#059669', fns: [
                { n: 'LEFT',        tpl: 'LEFT(COT, 5)',                 d: 'Lấy n ký tự bên trái' },
                { n: 'RIGHT',       tpl: 'RIGHT(COT, 3)',                d: 'Lấy n ký tự bên phải' },
                { n: 'MID',         tpl: 'MID(COT, 2, 4)',               d: 'Lấy từ vị trí bắt đầu, n ký tự' },
                { n: 'LEN',         tpl: 'LEN(COT)',                     d: 'Đếm tổng số ký tự' },
                { n: 'TRIM',        tpl: 'TRIM(COT)',                    d: 'Xóa khoảng trắng thừa 2 đầu và giữa' },
                { n: 'UPPER',       tpl: 'UPPER(COT)',                   d: 'Chuyển toàn bộ sang CHỮ HOA' },
                { n: 'LOWER',       tpl: 'LOWER(COT)',                   d: 'Chuyển toàn bộ sang chữ thường' },
                { n: 'PROPER',      tpl: 'PROPER(COT)',                  d: 'Viết Hoa Chữ Đầu Mỗi Từ' },
                { n: 'SUBSTITUTE',  tpl: 'SUBSTITUTE(COT, "cu", "moi")', d: 'Thay thế toàn bộ chuỗi con' },
                { n: 'REPLACE',     tpl: 'REPLACE(COT, 1, 3, "moi")',    d: 'Thay n ký tự từ vị trí chỉ định' },
                { n: 'CONCAT',      tpl: 'CONCAT(C1, C2)',               d: 'Nối chuỗi' },
                { n: 'TEXT',        tpl: 'TEXT(COT, "0.00")',            d: 'Định dạng số' },
                { n: 'VALUE',       tpl: 'VALUE(COT)',                   d: 'Chuyển chuỗi → số' },
            ]},
            { cat: '🔢 Số học', color: '#2563eb', fns: [
                { n: 'ROUND',      tpl: 'ROUND(COT, 0)',       d: 'Làm tròn số' },
                { n: 'ABS',        tpl: 'ABS(COT)',            d: 'Giá trị tuyệt đối' },
                { n: 'MOD',        tpl: 'MOD(COT, 10)',        d: 'Phần dư' },
                { n: 'SUM',        tpl: 'SUM(C1, C2)',         d: 'Tổng cộng' },
                { n: 'AVERAGE',    tpl: 'AVERAGE(C1, C2)',     d: 'Trung bình' },
                { n: 'MAX',        tpl: 'MAX(C1, C2)',         d: 'Lớn nhất' },
                { n: 'MIN',        tpl: 'MIN(C1, C2)',         d: 'Nhỏ nhất' },
                { n: 'COUNT',      tpl: 'COUNT(C1, C2)',       d: 'Đếm số' },
            ]},
            { cat: '🔗 Logic & Kiểm tra', color: '#b45309', fns: [
                { n: 'AND',      tpl: 'AND(C1>0, C2<100)',    d: 'VÀ (&&)' },
                { n: 'OR',       tpl: 'OR(C1=="A", C2=="B")', d: 'HOẶC (||)' },
                { n: 'NOT',      tpl: 'NOT(ISBLANK(COT))',    d: 'Phủ định' },
                { n: 'ISBLANK',  tpl: 'ISBLANK(COT)',         d: 'Kiểm tra rỗng' },
                { n: 'ISNUMBER', tpl: 'ISNUMBER(COT)',        d: 'Kiểm tra số' },
            ]},
            { cat: '📅 Ngày Tháng', color: '#0891b2', fns: [
                { n: 'DATECONVERTPRO', tpl: 'DATECONVERTPRO(COT, "dd*mm*yyyy", "dd/mm/yyyy")', d: 'Chuyển định dạng thông minh — * khớp mọi ký tự phân cách (-, /, _, .). Trả "Error" nếu ngày tháng sai.' },
                { n: 'DATECONVERT',tpl: 'DATECONVERT(COT, "dd/mm/yyyy", "mm-dd-yyyy")', d: 'Chuyển định dạng chủ động (Gốc → Mới)' },
                { n: 'DATEFORMAT', tpl: 'DATEFORMAT(COT, "dd-MM-yyyy")', d: 'Đổi định dạng (Máy tự đoán ngày gốc)' },
                { n: 'DATEDIF',    tpl: 'DATEDIF(C1, C2, "D")',             d: 'Khoảng cách ngày' },
                { n: 'TODAY',      tpl: 'TODAY()',                           d: 'Ngày hôm nay' },
                { n: 'DAYS',       tpl: 'DAYS(C2, C1)',                     d: 'Số ngày chênh lệch' },
                { n: 'ADDDAYS',    tpl: 'ADDDAYS(COT, 7)',                  d: 'Cộng thêm n ngày' },
                { n: 'DATEVALUE',  tpl: 'DATEVALUE("31/12/2024")',           d: 'Chuyển chữ thành ngày' },
            ]},
            { cat: '💰 Định Dạng Số', color: '#dc2626', fns: [
                { n: 'VND',       tpl: 'VND(COT)',              d: 'Định dạng tiền VND' },
                { n: 'DOLLAR',    tpl: 'DOLLAR(COT, 2)',        d: 'Định dạng tiền USD' },
                { n: 'NUMFORMAT', tpl: 'NUMFORMAT(COT, "VND")', d: 'Format nâng cao' },
            ]},
            { cat: '🔧 Tiện Ích', color: '#6b7280', fns: [
                { n: 'REMOVEACCENTS', tpl: 'REMOVEACCENTS(COT)',          d: 'Bỏ dấu tiếng Việt' },
                { n: 'REMOVEVN',      tpl: 'REMOVEVN(COT)',               d: 'Bỏ dấu tiếng Việt' },
                { n: 'EXTRACTNUM',    tpl: 'EXTRACTNUM(COT)',             d: 'Lấy số từ chuỗi' },
                { n: 'EXTRACTTEXT',   tpl: 'EXTRACTTEXT(COT)',            d: 'Lấy chữ từ chuỗi' },
            ]}
        ];

        function fbPreview(formula) {
            const _pad = n => String(n).padStart(2,'0');
            const prevEl = document.getElementById('fb-preview-result');
            if (!prevEl) return;
            if (!formula || !formula.trim()) { prevEl.textContent = ''; return; }
            try {
                const _parseFmt = (s, fmt) => {
                    if (s === null || s === undefined || s === '') return null;
                    if (s instanceof Date) return isNaN(s.getTime()) ? null : s;
                    const cleanS = String(s).trim();
                    const n = parseFloat(cleanS.replace(/,/g, ''));
                    if (!isNaN(n) && n > 10000 && n < 80000 && !cleanS.includes('/') && !cleanS.includes('-')) {
                        return new Date(Math.round((n - 25569) * 86400 * 1000));
                    }
                    const sParts = cleanS.split(/[\/\-\.\s]+/).filter(x => x !== '');
                    const fParts = (fmt || '').toLowerCase().split(/[\/\-\.\s]+/).filter(x => x !== '');
                    if (sParts.length < 3 || fParts.length < 3) return null;
                    let _d1, _m1, _y1;
                    fParts.forEach((part, i) => {
                        if (part.includes('d')) _d1 = parseInt(sParts[i]);
                        if (part.includes('m')) _m1 = parseInt(sParts[i]);
                        if (part.includes('y')) _y1 = parseInt(sParts[i]);
                    });
                    if (_y1 < 100) _y1 += (_y1 > 50 ? 1900 : 2000);
                    const dt = new Date(_y1, _m1 - 1, _d1);
                    return (isNaN(dt.getTime()) || dt.getDate() !== _d1) ? null : dt;
                };
                const _pd = v => {
                    if (!v && v !== 0) return null;
                    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
                    const s = String(v).trim();
                    if (s === '' || s.toLowerCase() === 'invalid date') return null;
                    if (s.includes('/') || s.includes('-') || s.includes('.')) {
                        const p = s.split(/[\/\-\.\s]+/).filter(x => x !== '');
                        if (p.length >= 3) {
                            let _d1, _m1, _y1;
                            if (p[0].length <= 2 && p[2].length >= 2) {
                                _d1 = parseInt(p[0]); _m1 = parseInt(p[1]); _y1 = parseInt(p[2]);
                                if (_y1 < 100) _y1 += (_y1 > 50 ? 1900 : 2000);
                                const dt = new Date(_y1, _m1 - 1, _d1);
                                if (!isNaN(dt.getTime()) && dt.getDate() === _d1) return dt;
                            }
                            if (p[0].length >= 4) {
                                _y1 = parseInt(p[0]); _m1 = parseInt(p[1]); _d1 = parseInt(p[2]);
                                const dt = new Date(_y1, _m1 - 1, _d1);
                                if (!isNaN(dt.getTime()) && dt.getDate() === _d1) return dt;
                            }
                        }
                    }
                    const n = parseFloat(s.replace(/,/g, ''));
                    if (!isNaN(n) && n > 10000 && n < 80000 && !s.includes('/') && !s.includes('-')) {
                        return new Date(Math.round((n - 25569) * 86400 * 1000));
                    }
                    const p = new Date(s); return isNaN(p.getTime()) ? null : p;
                };
                const _df = (v, fmt) => {
                    const d = _pd(v); if (!d) return ''; 
                    const _f = (fmt || 'dd/MM/yyyy').toLowerCase();
                    const _y = d.getFullYear(), _m = d.getMonth() + 1, _dy = d.getDate();
                    const _h = d.getHours(), _mi = d.getMinutes(), _s = d.getSeconds();
                    const MO = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
                    const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                    return _f.replace(/yyyy|yy|mmmm|mmm|mm|m|dd|d|hh|h|nn|n|ss|s/gi, tok => {
                        const t = tok.toLowerCase();
                        if (t==='yyyy') return _y; if (t==='yy') return String(_y).slice(-2);
                        if (t==='mmmm') return MO[d.getMonth()]; if (t==='mmm') return mo[d.getMonth()];
                        if (t==='mm') return _pad(_m); if (t==='m') return _m;
                        if (t==='dd') return _pad(_dy); if (t==='d') return _dy;
                        if (t==='hh') return _pad(_h); if (t==='nn') return _pad(_mi);
                        if (t==='ss') return _pad(_s);
                        return tok;
                    });
                };
                const _noAccent = s => String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,c=>c==='đ'?'d':'D');

                const _XL = {
                    IF:(c,t,f)=>c?t:f, IFS:(...a)=>{for(let i=0;i<a.length-1;i+=2){if(a[i])return a[i+1];}return a[a.length-1];},
                    IFERROR:(v,e)=>(v===null||v===undefined||String(v).startsWith('#'))?e:v,
                    IFBLANK:(v,e)=>(v===null||v===undefined||v==='')?e:v,
                    SWITCH:(val,...a)=>{for(let i=0;i<a.length-1;i+=2){if(val==a[i])return a[i+1];}return a[a.length-1];},
                    LEFT:(s,n)=>String(s??'').substring(0,n??1), RIGHT:(s,n)=>{const str=String(s??'');n=n??1;return str.substring(str.length-n);},
                    MID:(s,st,n)=>String(s??'').substring((st??1)-1,(st??1)-1+(n??1)), LEN:(s)=>String(s??'').length,
                    TRIM:(s)=>String(s??'').trim(), UPPER:(s)=>String(s??'').toUpperCase(), LOWER:(s)=>String(s??'').toLowerCase(),
                    PROPER:(s)=>String(s??'').replace(/\b\w/g,c=>c.toUpperCase()).replace(/\B\w/g,c=>c.toLowerCase()),
                    CONCATENATE:(...a)=>a.map(x=>x??'').join(''), CONCAT:(...a)=>a.map(x=>x??'').join(''),
                    TEXTJOIN:(sep,ig,...a)=>a.flat().filter(x=>!ig||(x!==null&&x!==undefined&&x!=='')).join(sep),
                    SUBSTITUTE:(s,od,nw,n)=>{s=String(s??'');if(n!=null){let c=0;return s.replace(new RegExp(String(od).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),m=>++c===n?String(nw):m);}return s.split(String(od)).join(String(nw));},
                    REPLACE:(s,st,n,nw)=>String(s??'').substring(0,(st??1)-1)+String(nw??'')+String(s??'').substring((st??1)-1+(n??0)),
                    FIND:(f,w,st)=>{const i=String(w??'').indexOf(String(f),(st??1)-1);return i===-1?'#N/A':i+1;},
                    SEARCH:(f,w,st)=>{const i=String(w??'').toLowerCase().indexOf(String(f??'').toLowerCase(),(st??1)-1);return i===-1?'#N/A':i+1;},
                    TEXT:(v,fmt)=>{if(!fmt)return String(v??'');const n=parseFloat(v);if(!isNaN(n)){if(fmt.includes('%'))return(n*100).toFixed(0)+'%';if(fmt.includes('.00'))return n.toFixed(2);if(fmt.includes('.0'))return n.toFixed(1);}return String(v??'');},
                    VALUE:(s)=>{const n=parseFloat(String(s??'').replace(/,/g,''));return isNaN(n)?0:n;},
                    EXACT:(a,b)=>String(a)===String(b), PADLEFT:(s,n,c)=>String(s??'').padStart(n??0, c??'0'), PADRIGHT:(s,n,c)=>String(s??'').padEnd(n??0, c??' '),
                    REMOVEACCENTS:s=>_noAccent(s), REMOVEVN:s=>_noAccent(s), EXTRACTNUM:s=>{const m=String(s??'').match(/[\d.,]+/g);return m?parseFloat(m.join('').replace(/,/g,'')):0;},
                    ROUND:(n,d)=>{d=d??0;return parseFloat((parseFloat(n)||0).toFixed(d));},
                    VND:n=>parseFloat(n||0).toLocaleString('vi-VN',{style:'currency',currency:'VND'}),
                    TODAY:()=>_df(new Date(),'dd/MM/yyyy'), DATEFORMAT:(v,fmt)=>_df(v,fmt),
                    DATECONVERT:(s,sf,df)=>_df(_parseFmt(s,sf), df),
                    // DATECONVERTPRO preview
                    DATECONVERTPRO: (s, srcFmt, destFmt) => {
                        if (s === null || s === undefined || String(s).trim() === '') return 'Error';
                        // _parseFmtPro inline cho preview
                        const cleanS = String(s).trim();
                        const numVal = parseFloat(cleanS.replace(/,/g, ''));
                        let _d, _m, _y;
                        if (!isNaN(numVal) && numVal > 10000 && numVal < 80000 && !(/[\/\-\._ ]/.test(cleanS))) {
                            const dt2 = new Date(Math.round((numVal - 25569) * 86400 * 1000));
                            if (isNaN(dt2.getTime())) return 'Error';
                            _d = dt2.getDate(); _m = dt2.getMonth() + 1; _y = dt2.getFullYear();
                        } else {
                            const sParts = cleanS.split(/[\s\/\-\._]+/).filter(x => x !== '');
                            const normFmt = srcFmt.replace(/\*/g, '|SEP|');
                            const fParts = normFmt.toLowerCase().split(/[\s\/\-\._|]+/).filter(x => x !== '' && x !== 'sep');
                            if (sParts.length < 3 || fParts.length < 3) return 'Error';
                            for (let i = 0; i < fParts.length; i++) {
                                const part = fParts[i], val = parseInt(sParts[i]);
                                if (isNaN(val)) return 'Error';
                                if (part.includes('d')) _d = val;
                                else if (part.includes('m')) _m = val;
                                else if (part.includes('y')) { _y = val; if (_y < 100) _y += (_y > 50 ? 1900 : 2000); }
                            }
                            if (_d === undefined || _m === undefined || _y === undefined) return 'Error';
                            if (_m < 1 || _m > 12) return 'Error';
                            if (_d < 1 || _d > 31) return 'Error';
                            const dim = new Date(_y, _m, 0).getDate();
                            if (_d > dim) return 'Error';
                            if (_y < 1900 || _y > 9999) return 'Error';
                            const dtCheck = new Date(_y, _m - 1, _d);
                            if (isNaN(dtCheck.getTime()) || dtCheck.getDate() !== _d || dtCheck.getMonth() + 1 !== _m) return 'Error';
                        }
                        return destFmt
                            .replace(/yyyy/gi, String(_y))
                            .replace(/yy/gi, String(_y).slice(-2))
                            .replace(/mm/gi, String(_m).padStart(2,'0'))
                            .replace(/(?<![m])m(?![m])/gi, String(_m))
                            .replace(/dd/gi, String(_d).padStart(2,'0'))
                            .replace(/(?<![d])d(?![d])/gi, String(_d));
                    },
                    SUM:(...a)=>a.flat().reduce((s,x)=>s+(parseFloat(x)||0),0),
                    MAX:(...a)=>Math.max(...a.flat().map(x=>parseFloat(x)||0)), MIN:(...a)=>Math.min(...a.flat().map(x=>parseFloat(x)||0)),
                    ISBLANK:(v)=>v===null||v===undefined||v==='', ISNUMBER:(v)=>!isNaN(parseFloat(v))&&v!==null, TRUE:true, FALSE:false,
                };

                let processedFormula = formula.replace(/([^<>!])=([^=])/g, '$1==$2');
                const expr = processedFormula.replace(/\[([^\]]+)\]/g, (_, col) => {
                    // Tìm cột không phân biệt hoa thường và khoảng trắng
                    const realKey = Object.keys(sampleRow).find(k => k.trim().toLowerCase() === col.trim().toLowerCase()) || col;
                    const v = sampleRow[realKey];
                    if (v === null || v === undefined || v === '') return '""';
                    const s = String(v).trim();
                    // Nếu chuỗi chứa dấu ngày tháng (/ hoặc -) thì BUỘC phải là chuỗi
                    if (s.includes('/') || s.includes('-') || s.includes('.')) {
                        return '"' + s.replace(/\\/g,'\\\\').replace(/"/g,'\\"') + '"';
                    }
                    if (s.startsWith('0') && s.length > 1) {
                        return '"' + s.replace(/\\/g,'\\\\').replace(/"/g,'\\"') + '"';
                    }
                    const n = parseFloat(s.replace(/,/g, ''));
                    return isNaN(n) ? '"' + s.replace(/\\/g,'\\\\').replace(/"/g,'\\"') + '"' : String(n);
                });
                const res = new Function('_XL', 'with(_XL){return ' + expr + ';}')(_XL);
                
                // Trích xuất các cột được dùng để hiển thị giá trị thực tế của dòng mẫu
                const usedCols = [...formula.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]);
                const debugInfo = usedCols.map(c => `${c}: "${sampleRow[c] || ''}"`).join(' | ');
                
                prevEl.innerHTML = `<div>▶ Kết quả mẫu: <span style="color:var(--success)">${res === undefined ? '' : res}</span></div>
                                   <div style="font-size:10px;color:#6b7280;margin-top:2px;font-weight:400;">(Dữ liệu dòng 1: ${debugInfo})</div>`;
            } catch(e) {
                prevEl.textContent = '⚠️ ' + e.message;
                prevEl.style.color = '#dc2626';
            }
        }

        const colChips = fbHeaders.map(h => `<button class="fb-col-btn" data-col="${h.replace(/"/g,'&quot;')}" style="padding:2px 7px;border-radius:4px;font-size:11px;cursor:pointer;border:1px solid #6366f1;color:#6366f1;background:#6366f110;white-space:nowrap;">[${h}]</button>`).join('');

        const fnRefHtml = FN_CATS.map(cat => `
            <div style="margin-bottom:8px;">
                <div style="font-size:10px;font-weight:700;color:${cat.color};margin-bottom:4px;">${cat.cat}</div>
                <div style="display:flex;flex-wrap:wrap;gap:3px;">
                    ${cat.fns.map(f => `<button class="fb-fn-btn" data-tpl="${f.tpl.replace(/"/g,'&quot;')}" title="${f.d}" style="padding:2px 6px;border-radius:4px;font-size:11px;cursor:pointer;border:1px solid ${cat.color};color:${cat.color};background:${cat.color}10;">${f.n}</button>`).join('')}
                </div>
            </div>`).join('');

        dynamicPane.innerHTML = `
            <h3 class="config-title" style="color:var(--success)">✅ Công Thức Excel (V2.0 - DATECONVERT READY)</h3>
            <p class="config-desc">Viết công thức theo cú pháp Excel. Dùng <b>[Tên Cột]</b> để tham chiếu cột dữ liệu.</p>
            <div style="margin-bottom:10px;">
                <label class="form-label">Tên cột kết quả</label>
                <input id="fb-col-name" class="form-control" style="height:32px;" placeholder="VD: Phan_Loai" value="${step.config.newColName || ''}" />
            </div>
            <label class="form-label">📝 Thanh Công Thức</label>
            <textarea id="fb-formula" rows="3" style="width:100%;font-family:monospace;font-size:13px;padding:8px;border:2px solid var(--primary);border-radius:6px;resize:vertical;box-sizing:border-box;line-height:1.5;" placeholder='VD: IF([So du]>=5000000, "VIP", "Thuong")'>${(step.config.formula || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
            <div id="fb-preview-result" style="font-size:12px;font-weight:600;margin:4px 0 10px 0;min-height:16px;"></div>
            <label class="form-label">📌 Cột dữ liệu (click để chèn)</label>
            <div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:12px;max-height:70px;overflow-y:auto;padding:4px 0;">${colChips}</div>
            <label class="form-label">📖 Tham chiếu hàm (click để chèn mẫu)</label>
            <div style="background:var(--surface);border-radius:8px;padding:8px;border:1px solid var(--border);max-height:300px;overflow-y:auto;">${fnRefHtml}</div>
        `;

        const ta = document.getElementById('fb-formula');
        ta.value = step.config.formula || '';
        fbPreview(ta.value);

        let fbDebounceTimer = null;
        ta.addEventListener('input', () => {
            step.config.formula = ta.value;
            fbPreview(ta.value);
            saveStateToLocal();
            clearTimeout(fbDebounceTimer);
            fbDebounceTimer = setTimeout(() => {
                const selStart = ta.selectionStart;
                const selEnd   = ta.selectionEnd;
                recalculatePipeline();
                setTimeout(() => {
                    const newTa = document.getElementById('fb-formula');
                    if (newTa) {
                        newTa.focus();
                        newTa.selectionStart = selStart;
                        newTa.selectionEnd   = selEnd;
                    }
                }, 80);
            }, 700);
        });
        document.getElementById('fb-col-name').addEventListener('input', e => {
            step.config.newColName = e.target.value.trim();
            saveStateToLocal();
        });
        document.querySelectorAll('.fb-col-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const ins = '[' + btn.dataset.col + ']';
                const s = ta.selectionStart, e2 = ta.selectionEnd;
                ta.value = ta.value.substring(0, s) + ins + ta.value.substring(e2);
                ta.selectionStart = ta.selectionEnd = s + ins.length;
                ta.focus(); ta.dispatchEvent(new Event('input'));
            });
        });
        document.querySelectorAll('.fb-fn-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const ins = btn.dataset.tpl;
                const s = ta.selectionStart, e2 = ta.selectionEnd;
                ta.value = ta.value.substring(0, s) + ins + ta.value.substring(e2);
                ta.selectionStart = ta.selectionEnd = s + ins.length;
                ta.focus(); ta.dispatchEvent(new Event('input'));
            });
        });
    }

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
                    // COMPARE cần nạp FULL data
                    const result = await readExcelFile(e.target.files[0], null);
                    const sName = result.sheetNames[0];
                    step.config.compareData = result.sheetsData[sName].data; 
                    
                    // Giải phóng Worker ngay lập tức
                    if (result.workerApi) result.workerApi.terminate();
                    
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
    if (AppState.rootData.length === 0) {
        alert("Bảng dữ liệu gốc đang trống, không có gì để xuất.");
        return;
    }

    document.getElementById('global-loading').classList.remove('hidden');
    document.getElementById('global-loading-text').innerText = "Đang chạy Engine xử lý Data lớn (Xin vui lòng đợi)...";
    
    // setTimeout để UI kịp hiện Loading Spinner
    setTimeout(async () => {
        try {
            const workerApi = AppState.rootFileCache.workerApi;

            // Lấy FULL data từ sheet hiện tại (không giới hạn preview)
            const currentSheet = AppState.rootSelectedSheet || AppState.rootFileCache.sheetNames[0];
            const fullData = AppState.rootFileCache.sheetsData[currentSheet]
                ? AppState.rootFileCache.sheetsData[currentSheet].fullData
                : AppState.rootData;

            // 1. Gửi FULL data + pipeline xuống Worker để xử lý
            document.getElementById('global-loading-text').innerText = "Đang tính toán toàn bộ pipeline trong Worker...";
            const pipelineResult = await workerApi.runPipeline(AppState.steps, fullData);

            // 2. Yêu cầu Worker tạo File Excel hoặc ghép vào File gốc
            document.getElementById('global-loading-text').innerText = "Đang chuẩn bị xuất file...";
            
            let buffer;
            if (AppState.rootFileCache && AppState.rootFileCache.originalBuffer) {
                try {
                    // Lấy toàn bộ dữ liệu đã được xử lý từ Worker
                    document.getElementById('global-loading-text').innerText = "Đang tải dữ liệu kết quả từ Worker...";
                    const processedData = await workerApi.getProcessedData();

                    document.getElementById('global-loading-text').innerText = "Đang ghép các cột mới vào File Excel gốc...";
                    // Khởi tạo ExcelJS Workbook từ buffer gốc để bảo toàn định dạng và font
                    const workbook = new ExcelJS.Workbook();
                    await workbook.xlsx.load(AppState.rootFileCache.originalBuffer);
                    
                    const worksheet = workbook.getWorksheet(currentSheet);
                    
                    if (worksheet) {
                        const headerMap = {};
                        const originalHeaders = [];

                        // Đọc và map Header hiện có của worksheet
                        const headerRow = worksheet.getRow(1);
                        headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                            let hName = String(cell.value || '').trim();
                            if (hName) {
                                const encoding = AppState.rootFileCache.sheetsData[currentSheet]?.detectedEncoding;
                                if (encoding && encoding !== 'NONE') {
                                    hName = VietEncoder.fix(hName, encoding);
                                }
                                headerMap[hName] = colNumber;
                                originalHeaders.push(hName);
                            }
                        });

                        // Xác định xem có phải là Group By hay so sánh mà làm thay đổi cấu trúc hoàn toàn không
                        const hasOriginalIndices = processedData.some(r => r.__original_row_idx__ !== undefined);

                        // Kiểm tra xem thứ tự dòng có bị đảo lộn (sắp xếp) không
                        let isOrderSame = true;
                        if (hasOriginalIndices) {
                            let lastIdx = 1;
                            for (const row of processedData) {
                                if (row.__original_row_idx__ !== undefined) {
                                    if (row.__original_row_idx__ < lastIdx) {
                                        isOrderSame = false;
                                        break;
                                    }
                                    lastIdx = row.__original_row_idx__;
                                }
                            }
                        }

                        if (!hasOriginalIndices || !isOrderSame) {
                            // Nếu là GROUP_BY hoặc có SORT làm đảo lộn dòng, xóa toàn bộ dòng và ghi mới hoàn toàn
                            const totalRows = worksheet.rowCount;
                            if (totalRows >= 2) {
                                worksheet.spliceRows(2, totalRows - 1);
                            }
                            // Rebuild từ đầu
                            const processedHeaders = Object.keys(processedData[0] || {}).filter(h => h !== '__original_row_idx__');
                            headerRow.values = processedHeaders;
                            
                            // Khử lỗi font legacy tiếng Việt cho header row
                            headerRow.eachCell((cell, colNumber) => {
                                const currentFont = cell.font || (worksheet.getColumn(colNumber).font) || {};
                                const fName = String(currentFont.name || '').toLowerCase();
                                if (fName.startsWith('.vn') || fName.startsWith('vni-')) {
                                    cell.font = { ...currentFont, name: 'Calibri' };
                                }
                            });

                            processedData.forEach((procRow, idx) => {
                                const wsRow = worksheet.getRow(idx + 2);
                                processedHeaders.forEach((h, colIdx) => {
                                    const cell = wsRow.getCell(colIdx + 1);
                                    cell.value = procRow[h];
                                    
                                    const currentFont = cell.font || (worksheet.getColumn(colIdx + 1).font) || {};
                                    const fName = String(currentFont.name || '').toLowerCase();
                                    if (fName.startsWith('.vn') || fName.startsWith('vni-')) {
                                        cell.font = { ...currentFont, name: 'Calibri' };
                                    }
                                });
                            });
                        } else {
                            // TRƯỜNG HỢP LÝ TƯỞNG: Thứ tự dòng giữ nguyên (chỉ LỌC hoặc thêm cột CÔNG THỨC/VLOOKUP)
                            
                            // 1. Tìm các cột mới sinh ra từ pipeline để chèn tiếp vào cuối
                            const processedHeaders = Object.keys(processedData[0] || {});
                            const newColumns = processedHeaders.filter(h => h !== '__original_row_idx__' && !headerMap[h]);

                            // Điền thêm header cho các cột mới
                            let nextColIndex = originalHeaders.length + 1;
                            newColumns.forEach(newCol => {
                                headerMap[newCol] = nextColIndex;
                                const cell = headerRow.getCell(nextColIndex);
                                cell.value = newCol;
                                
                                // Sao chép style từ ô header cuối cùng để đồng nhất giao diện, xóa font legacy tiếng Việt
                                const lastHeaderCell = headerRow.getCell(originalHeaders.length);
                                if (lastHeaderCell && lastHeaderCell.style) {
                                    const newStyle = JSON.parse(JSON.stringify(lastHeaderCell.style));
                                    const currentFont = newStyle.font || (worksheet.getColumn(nextColIndex).font) || {};
                                    const fName = String(currentFont.name || '').toLowerCase();
                                    if (fName.startsWith('.vn') || fName.startsWith('vni-')) {
                                        newStyle.font = { ...currentFont, name: 'Calibri' };
                                    }
                                    cell.style = newStyle;
                                }
                                nextColIndex++;
                            });

                            // Khử lỗi font cho các cột header cũ (nếu có dùng TCVN3/VNI)
                            headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                                if (colNumber <= originalHeaders.length) {
                                    const origHeader = originalHeaders[colNumber - 1];
                                    const unicodeHeader = AppState.rootHeaders[colNumber - 1] || origHeader;
                                    cell.value = unicodeHeader;
                                }
                                
                                const currentFont = cell.font || (worksheet.getColumn(colNumber).font) || {};
                                const fName = String(currentFont.name || '').toLowerCase();
                                if (fName.startsWith('.vn') || fName.startsWith('vni-')) {
                                    cell.font = { ...currentFont, name: 'Calibri' };
                                }
                            });

                            // 2. Ghi đè Unicode cho toàn bộ các ô cũ/mới và khử sạch font legacy tiếng Việt
                            processedData.forEach((procRow) => {
                                const origRowIdx = procRow.__original_row_idx__;
                                const wsRow = worksheet.getRow(origRowIdx);
                                
                                processedHeaders.forEach(colName => {
                                    const colNumber = headerMap[colName];
                                    if (colNumber) {
                                        const cell = wsRow.getCell(colNumber);
                                        
                                        if (newColumns.includes(colName)) {
                                            // Cột mới: ghi giá trị
                                            cell.value = procRow[colName];
                                            
                                            // Sao chép định dạng của ô bên trái để đồng nhất style, nhưng xóa font legacy tiếng Việt
                                            if (colNumber > 1) {
                                                const leftCell = wsRow.getCell(colNumber - 1);
                                                if (leftCell && leftCell.style) {
                                                    const newStyle = JSON.parse(JSON.stringify(leftCell.style));
                                                    const currentFont = newStyle.font || (worksheet.getColumn(colNumber).font) || {};
                                                    const fName = String(currentFont.name || '').toLowerCase();
                                                    if (fName.startsWith('.vn') || fName.startsWith('vni-')) {
                                                        newStyle.font = { ...currentFont, name: 'Calibri' };
                                                    }
                                                    cell.style = newStyle;
                                                }
                                            }
                                        } else {
                                            // Cột cũ: ghi đè giá trị Unicode sạch và khử font legacy
                                            cell.value = procRow[colName];
                                            
                                            const currentFont = cell.font || (worksheet.getColumn(colNumber).font) || {};
                                            const fName = String(currentFont.name || '').toLowerCase();
                                            if (fName.startsWith('.vn') || fName.startsWith('vni-')) {
                                                cell.font = { ...currentFont, name: 'Calibri' };
                                            }
                                        }
                                    }
                                });
                                
                                // Xóa dữ liệu các cột cũ nếu đã bị drop trong pipeline
                                originalHeaders.forEach(origHName => {
                                    if (!processedHeaders.includes(origHName) && headerMap[origHName]) {
                                        const colNum = headerMap[origHName];
                                        const cell = wsRow.getCell(colNum);
                                        cell.value = null; // Clear content of dropped column
                                        const currentFont = cell.font || (worksheet.getColumn(colNum).font) || {};
                                        const fName = String(currentFont.name || '').toLowerCase();
                                        if (fName.startsWith('.vn') || fName.startsWith('vni-')) {
                                            cell.font = { ...currentFont, name: 'Calibri' };
                                        }
                                    }
                                });
                            });

                            // 3. Xóa các dòng bị lọc từ dưới lên trên để không làm lệch chỉ mục vật lý
                            const activeIndices = new Set(processedData.map(r => r.__original_row_idx__).filter(Boolean));
                            for (let r = worksheet.rowCount; r >= 2; r--) {
                                if (!activeIndices.has(r)) {
                                    worksheet.spliceRows(r, 1);
                                }
                            }
                        }
                    }
                    
                    const arrBuffer = await workbook.xlsx.writeBuffer();
                    buffer = arrBuffer;
                } catch (mergeErr) {
                    console.warn("Main thread merge failed, falling back to clean worker export:", mergeErr);
                    buffer = await workerApi.exportFinal();
                }
            } else {
                buffer = await workerApi.exportFinal();
            }

            if (!buffer || buffer.byteLength === 0) throw new Error("File tạo ra bị trống. Vui lòng thử lại.");

            // 3. Tải file về máy
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const finalFileName = `Export_${AppState.rootFileCache.fileName.split('.')[0]}_${_dateStr()}.xlsx`;
            a.download = finalFileName;
            a.click();
            window.URL.revokeObjectURL(url);

            alert(`✅ Đã xử lý và xuất xong ${pipelineResult.totalRows.toLocaleString()} dòng dữ liệu!`);
        } catch (err) {
            console.error("Lỗi Xuất File:", err);
            alert("Lỗi xuất file: " + err.message);
        } finally {
            document.getElementById('global-loading').classList.add('hidden');
        }
    }, 50);
});

// === CONFIG PANEL: click-outside để đóng ===
(function () {
    const panel = document.getElementById('config-panel');
    if (!panel) return;

    function closePanel() {
        panel.classList.remove('open');
        const stepIdBeforeClose = AppState.activeStepId;
        AppState.activeStepId = null;
        document.querySelectorAll('.step-card').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.step-node-container').forEach(n => n.classList.remove('active'));
        // Redraw ngay lập tức (panel là fixed overlay, canvas không bị che trong lúc animate)
        AppState.activeStepId = stepIdBeforeClose;
        renderPreviewAtActiveStep();
        AppState.activeStepId = null;
    }

    // Click ngoài panel → đóng (mousedown để bắt trước click)
    document.addEventListener('mousedown', (e) => {
        if (!panel.classList.contains('open')) return;
        if (panel.contains(e.target)) return;
        if (e.target.closest('.step-node-container')) return;
        if (e.target.closest('#btn-add-step')) return;
        if (e.target.closest('#dropdown-add-step')) return;
        closePanel();
    });

    // Nút X
    const btnClose = document.getElementById('btn-close-config');
    if (btnClose) btnClose.addEventListener('click', closePanel);

    window._closeConfigPanel = closePanel;
})();

// INITIALIZE & AUTO-LOAD
loadStateFromLocal();
renderPipelineSteps();
