/* BỘ ĐIỀU KHIỂN UI - STUDIO PIPELINE */

// --- STATE QUẢN LÝ ---
const AppState = {
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

    if (type === 'FILTER') { title = "Lọc Dữ Liệu"; config = { conditions: [] }; }
    else if (type === 'VLOOKUP') { title = "Merge Bảng Data"; config = { joinType: 'LEFT', lookupData: null, grabColumns: [], enableFlag: false, flagColName: 'Trang_Thai_Khop' }; }
    else if (type === 'GROUP_BY') { title = "Gộp (Group By)"; config = { aggregates: [] }; }
    else if (type === 'CONDITIONAL_COLUMN') { title = "Thêm Cột (Logic IF)"; config = { newColName: "", rules: [], elseVal: "", elseType: "VALUE" }; }
    else if (type === 'MATH_COMPUTE') { title = "Phép Tính Toán Học"; config = { newColName: "", col1: "", op: "-", type2: "COLUMN", col2: "", val2: "" }; }
    else if (type === 'SELECT_COLUMNS') { title = "Chọn/Đổi Tên Cột"; config = { columns: [] }; }

    return { id, type, title, config, disabled: false };
}

// --- RENDERING PIPELINE STEPS (LEFT SIDEBAR) ---
function renderPipelineSteps() {
    const container = document.getElementById('pipeline-steps');
    container.innerHTML = `
        <div class="step-card ${AppState.activeStepId === 'ROOT' ? 'active' : ''}" data-id="ROOT">
            <div class="step-status"></div>
            <div class="step-title">0. Tải File Tự Động <span style="color:var(--success)">Gốc</span></div>
            <div class="step-desc">${AppState.rootHeaders.length ? AppState.rootData.length + ' dòng dữ liệu' : 'Chưa tải file'}</div>
        </div>
    `;

    AppState.steps.forEach((step, index) => {
        const div = document.createElement('div');
        div.className = `step-card ${AppState.activeStepId === step.id ? 'active' : ''} ${step.disabled ? 'disabled' : ''}`;
        div.dataset.id = step.id;
        
        div.innerHTML = `
            <div class="step-status"></div>
            <div class="step-title">
                ${index + 1}. ${step.title}
                <div class="step-actions">
                    <button class="btn-icon btn-toggle-step" title="${step.disabled ? 'Bật' : 'Tắt'}">${step.disabled ? '👁️‍🗨️' : '👁️'}</button>
                    <button class="btn-icon btn-del-step" title="Xoá">✕</button>
                </div>
            </div>
            <div class="step-desc">${getStepDesc(step)}</div>
        `;
        container.appendChild(div);
    });

    // Bắt sự kiện Click vào Card để Active
    document.querySelectorAll('.step-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.btn-toggle-step') || e.target.closest('.btn-del-step')) return; // Bỏ qua nếu bấm nút con
            AppState.activeStepId = card.dataset.id;
            renderPipelineSteps();
            renderConfigPanel();
            renderPreviewAtActiveStep();
        });
    });

    // Bắt sự kiện Xoá/Tắt
    document.querySelectorAll('.btn-del-step').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.closest('.step-card').dataset.id;
            AppState.steps = AppState.steps.filter(s => s.id !== id);
            if (AppState.activeStepId === id) AppState.activeStepId = 'ROOT';
            recalculatePipeline();
        });
    });
    
    document.querySelectorAll('.btn-toggle-step').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.closest('.step-card').dataset.id;
            const step = AppState.steps.find(s => s.id === id);
            step.disabled = !step.disabled;
            recalculatePipeline();
        });
    });
}

function getStepDesc(step) {
    if (step.type === 'FILTER') return step.config.conditions.length ? `${step.config.conditions.length} điều kiện lọc` : 'Chưa cấu hình';
    if (step.type === 'VLOOKUP') return step.config.lookupData ? `Join ${step.config.grabColumns.length} cột qua ${step.config.baseKey || '?'}` : 'Chưa nhập file';
    if (step.type === 'GROUP_BY') return step.config.groupCol ? `Nhóm theo ${step.config.groupCol}` : 'Chưa cấu hình';
    if (step.type === 'CONDITIONAL_COLUMN') return step.config.newColName ? `Tạo cột: ${step.config.newColName}` : 'Chưa cấu hình';
    if (step.type === 'MATH_COMPUTE') return step.config.newColName ? `Làm toán: ${step.config.newColName}` : 'Chưa cấu hình';
    if (step.type === 'SELECT_COLUMNS') return step.config.columns.length ? `Giữ ${step.config.columns.length} cột xuất` : 'Chưa cấu hình';
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
async function recalculatePipeline() {
    if (AppState.rootData.length === 0) return;
    
    document.getElementById('preview-mini-loading').classList.remove('hidden');
    
    setTimeout(async () => {
        let currentData = [...AppState.rootData];
        AppState.cachedResults.set('ROOT', currentData);

        for (const step of AppState.steps) {
            if (!step.disabled) {
                currentData = applyStepToData(currentData, step);
            }
            AppState.cachedResults.set(step.id, currentData); // Cache kết quả sau mỗi bước
        }

        renderPipelineSteps(); // Cập nhật Mô tả
        renderPreviewAtActiveStep();
        
        document.getElementById('preview-mini-loading').classList.add('hidden');
    }, 10);
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

// Hiển thị Preview Data tại Step click vào
function renderPreviewAtActiveStep() {
    const activeData = AppState.cachedResults.get(AppState.activeStepId);
    if (!activeData) {
        document.getElementById('preview-tbody').innerHTML = '<tr><td colspan="100" class="text-center">Dữ liệu trống (Hoặc chưa tải file)</td></tr>';
        return;
    }

    // Header array
    const headers = activeData.length > 0 ? Object.keys(activeData[0]) : getHeadersAtCurrentStep();
    
    // Render thead
    const thead = document.getElementById('preview-thead');
    thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;

    // Render tbody (chỉ lấy top 100)
    const tbody = document.getElementById('preview-tbody');
    tbody.innerHTML = "";
    
    const limit = Math.min(100, activeData.length);
    for (let i = 0; i < limit; i++) {
        const row = activeData[i];
        const tr = document.createElement('tr');
        tr.innerHTML = headers.map(h => `<td>${row[h] !== undefined && row[h] !== null ? row[h] : ''}</td>`).join('');
        tbody.appendChild(tr);
    }
    
    document.getElementById('preview-row-count').innerText = `${activeData.length.toLocaleString()} dòng (Full)`;
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
        dynamicPane.innerHTML = `
            <h3 class="config-title">Nguồn Dữ Liệu Gốc</h3>
            <p class="config-desc">Kéo thẻ file Excel báo cáo của bạn và thả vào vùng dưới đây.</p>
            <div class="pipeline-dropzone" id="root-dropzone">
                <p>Kéo và thả file gốc (Excel) vào đây...</p>
                <input type="file" id="root-file-input" accept=".xlsx, .xls, .csv" hidden />
            </div>
        `;

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
                    AppState.rootData = result.data;
                    AppState.rootHeaders = result.headers;
                    await recalculatePipeline();
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
        dynamicPane.innerHTML = `
            <h3 class="config-title">Bộ Lọc Dữ Liệu</h3>
            <p class="config-desc">Thiết lập các điều kiện để loại bỏ những dòng không cần thiết.</p>
            
            <div id="filter-list" style="margin-bottom: 12px;"></div>
            
            <div class="row" style="align-items:flex-end;">
                <div class="col">
                    <label class="form-label">Chọn Móc Cột</label>
                    <select id="flt-col" class="form-control"><option value="">-- Chọn --</option>${optHtml}</select>
                </div>
                <div class="col">
                    <label class="form-label">Toán tử</label>
                    <select id="flt-op" class="form-control">
                        <option value="CONTAINS">Chứa giá trị (Contains)</option>
                        <option value="EQUALS">Bằng chính xác (=)</option>
                        <option value="NOT_EQUALS">Không bằng (!=)</option>
                    </select>
                </div>
                <div class="col">
                    <label class="form-label">Giá trị</label>
                    <input type="text" id="flt-val" class="form-control" placeholder="VD: THÀNH CÔNG">
                </div>
                <button class="btn btn-primary" style="height: 40px; margin-bottom: 2px;" id="flt-add">Thêm</button>
            </div>
        `;
        
        // Hiển thị list
        const listUI = document.getElementById('filter-list');
        step.config.conditions.forEach((c, idx) => {
            const tag = document.createElement('span'); tag.className = 'filter-tag';
            tag.innerHTML = `${c.col} <i>${c.op}</i> <b>${c.val}</b> <button data-idx="${idx}">✕</button>`;
            listUI.appendChild(tag);
        });

        // Xoá điều kiện
        listUI.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                step.config.conditions.splice(e.target.dataset.idx, 1);
                recalculatePipeline();
                renderConfigPanel();
            }
        });

        // Thêm điều kiện
        document.getElementById('flt-add').addEventListener('click', () => {
            const c = document.getElementById('flt-col').value;
            const o = document.getElementById('flt-op').value;
            const v = document.getElementById('flt-val').value;
            if (c && v) {
                step.config.conditions.push({col: c, op: o, val: v});
                recalculatePipeline();
                renderConfigPanel();
            }
        });
    }

    /** BƯỚC THÊM CỘT ĐIỀU KIỆN (COMPUTE/IF) **/
    else if (step.type === 'CONDITIONAL_COLUMN') {
        dynamicPane.innerHTML = `
            <h3 class="config-title">Thêm Cột Tính Tính Tốn (IF/THEN)</h3>
            <p class="config-desc">So sánh dữ liệu để gán kết quả đầu ra theo ý muốn (Tương tự IFERROR, IF...)</p>

            <div class="row" style="margin-bottom: 16px;">
                <div class="col" style="max-width: 300px;">
                    <label class="form-label">Tên Cột Mới</label>
                    <input type="text" id="cond-new-col" class="form-control" value="${step.config.newColName || ''}" placeholder="VD: Trạng Thái">
                </div>
            </div>

            <div style="border-top: 1px solid var(--border); padding-top: 16px;">
                <label class="form-label">Quy Tắc (Rules) - Ưu tiên duyệt từ trên xuống</label>
                <div id="cond-rules-list" style="margin-bottom: 12px; display:flex; flex-direction:column; gap:8px;"></div>
                
                <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px; border: 1px dashed var(--border);">
                    <div class="row" style="align-items:flex-end; margin-bottom: 8px;">
                        <div class="col">
                            <select id="cond-if-col" class="form-control"><option value="">-- NẾU CỘT --</option>${optHtml}</select>
                        </div>
                        <div class="col">
                            <select id="cond-op" class="form-control">
                                <option value="=">Bằng (=)</option>
                                <option value="!=">Khác (!=)</option>
                                <option value=">">Lớn hơn (>)</option>
                                <option value="<">Nhỏ hơn (<)</option>
                                <option value=">=">Lớn hơn bằng</option>
                                <option value="<=">Nhỏ hơn bằng</option>
                                <option value="IS_EMPTY">Bị trống/Lỗi (IS BLANK/ERROR)</option>
                                <option value="NOT_EMPTY">Có Dữ Liệu</option>
                            </select>
                        </div>
                    </div>
                    <div class="row" style="align-items:flex-end; margin-bottom: 8px;" id="cond-compare-area">
                        <div class="col">
                            <select id="cond-comp-type" class="form-control">
                                <option value="VALUE">Với Giá Trị Gõ Tay</option>
                                <option value="COLUMN">Với Cột Khác</option>
                            </select>
                        </div>
                        <div class="col" id="cond-comp-val-area">
                            <input type="text" id="cond-comp-val" class="form-control" placeholder="Giá trị so sánh">
                        </div>
                    </div>
                    <div class="row" style="align-items:flex-end;">
                        <div class="col">
                            <label class="form-label" style="color:var(--success);">VẬY THÌ KẾT QUẢ ĐẦU RA SẼ LÀ:</label>
                            <select id="cond-then-type" class="form-control" style="margin-bottom:4px;">
                                <option value="VALUE">Giá Trị Cố Định (Text/Số)</option>
                                <option value="COLUMN">Lấy từ Cột Khác</option>
                            </select>
                            <input type="text" id="cond-then-val" class="form-control" placeholder="Giá trị...">
                        </div>
                        <button class="btn btn-outline" id="cond-add-rule" style="height:40px;">+ Thêm Quy Tắc</button>
                    </div>
                </div>

                <div class="row" style="align-items:flex-end; margin-top: 16px;">
                    <div class="col" style="max-width: 300px;">
                        <label class="form-label" style="color:var(--warning);">NẾU KHÔNG CÓ CÁI NÀO THOẢ MÃN (ELSE):</label>
                        <input type="text" id="cond-else-val" class="form-control" value="${step.config.elseVal || ''}" placeholder="Giá trị mặc định...">
                    </div>
                </div>
            </div>
        `;

        // Handle Events inside CONDITIONAL
        document.getElementById('cond-op').addEventListener('change', (e) => {
            if (e.target.value === 'IS_EMPTY' || e.target.value === 'NOT_EMPTY') {
                document.getElementById('cond-compare-area').classList.add('hidden');
            } else {
                document.getElementById('cond-compare-area').classList.remove('hidden');
            }
        });

        document.getElementById('cond-comp-type').addEventListener('change', (e) => {
            const area = document.getElementById('cond-comp-val-area');
            if (e.target.value === 'VALUE') area.innerHTML = `<input type="text" id="cond-comp-val" class="form-control" placeholder="Giá trị">`;
            else area.innerHTML = `<select id="cond-comp-val" class="form-control">${optHtml}</select>`;
        });

        document.getElementById('cond-then-type').addEventListener('change', (e) => {
            const thenValInput = document.getElementById('cond-then-val');
            if (e.target.value === 'VALUE') {
                const inp = document.createElement('input'); inp.type='text'; inp.id='cond-then-val'; inp.className='form-control'; inp.placeholder='Giá trị...';
                thenValInput.replaceWith(inp);
            } else {
                const sel = document.createElement('select'); sel.id='cond-then-val'; sel.className='form-control'; sel.innerHTML = optHtml;
                thenValInput.replaceWith(sel);
            }
        });

        const rList = document.getElementById('cond-rules-list');
        step.config.rules.forEach((r, idx) => {
            const tag = document.createElement('div'); 
            tag.style = "background:var(--bg-card); padding:8px 12px; border:1px solid var(--border); border-radius:6px; display:flex; justify-content:space-between; font-size:13px; align-items:center;";
            let condText = r.op === 'IS_EMPTY' || r.op === 'NOT_EMPTY' ? r.op : `${r.op} ${r.compareType === 'COLUMN' ? '[Cột: '+r.compareVal+']' : r.compareVal}`;
            let thenText = r.thenType === 'COLUMN' ? `[Cột:${r.thenVal}]` : r.thenVal;
            tag.innerHTML = `<span>NẾU <b>[${r.ifCol}]</b> ${condText} ➔ ĐẦU RA LÀ: <b>${thenText}</b></span> <button class="btn-icon" data-idx="${idx}" style="width:20px;height:20px;">✕</button>`;
            rList.appendChild(tag);
        });

        rList.addEventListener('click', (e) => {
            if (e.target.closest('button')) {
                step.config.rules.splice(e.target.closest('button').dataset.idx, 1);
                recalculatePipeline();
                renderConfigPanel();
            }
        });

        document.getElementById('cond-add-rule').addEventListener('click', () => {
            const r = {
                ifCol: document.getElementById('cond-if-col').value,
                op: document.getElementById('cond-op').value,
                compareType: document.getElementById('cond-comp-type').value,
                compareVal: document.getElementById('cond-comp-val') ? document.getElementById('cond-comp-val').value : "",
                thenType: document.getElementById('cond-then-type').value,
                thenVal: document.getElementById('cond-then-val').value,
            };
            if (r.ifCol && r.thenVal !== undefined) {
                step.config.rules.push(r);
                recalculatePipeline();
                renderConfigPanel();
            }
        });

        document.getElementById('cond-new-col').addEventListener('input', (e) => { step.config.newColName = e.target.value; recalculatePipeline(); });
        document.getElementById('cond-else-val').addEventListener('input', (e) => { step.config.elseVal = e.target.value; recalculatePipeline(); });
    }

    /** BƯỚC MATH COMPUTE (TOÁN HỌC) **/
    else if (step.type === 'MATH_COMPUTE') {
        dynamicPane.innerHTML = `
            <h3 class="config-title">Công Thức Toán Học (+ - * /)</h3>
            <p class="config-desc">Thực hiện các phép tính số học giữa 2 cột, hoặc giữa 1 cột với giá trị cố định (Ví dụ: Tính Chênh Lệch, % Tăng Trưởng).</p>

            <div class="row" style="margin-bottom: 16px;">
                <div class="col" style="max-width: 300px;">
                    <label class="form-label">Tên Cột Kết Quả Mới (Ví dụ: Cột Chênh Lệch)</label>
                    <input type="text" id="math-new-col" class="form-control" value="${step.config.newColName || ''}" placeholder="Nhập tên cột đầu ra">
                </div>
            </div>

            <div style="background: rgba(0,0,0,0.2); padding: 16px; border-radius: 8px; border: 1px bordered var(--border);">
                <div class="row" style="align-items:flex-end; margin-bottom: 12px; max-width:800px;">
                    <div class="col" style="flex:2;">
                        <label class="form-label">Lấy giá trị Cột 1</label>
                        <select id="math-col1" class="form-control"><option value="">-- Chọn Cột --</option>${optHtml}</select>
                    </div>
                    <div class="col" style="flex:1;">
                        <label class="form-label">Phép Toán</label>
                        <select id="math-op" class="form-control">
                            <option value="-">Trừ (-)</option>
                            <option value="+">Cộng (+)</option>
                            <option value="*">Nhân (x)</option>
                            <option value="/">Chia (/)</option>
                            <option value="%_CHANGE">% Tăng Trưởng</option>
                        </select>
                    </div>
                    <div class="col" style="flex:2;">
                        <label class="form-label">Cột 2 / Hoặc Số Cố Định</label>
                        <select id="math-type2" class="form-control" style="margin-bottom: 4px;">
                            <option value="COLUMN">Với Cột Khác</option>
                            <option value="VALUE">Với Số Cố Định</option>
                        </select>
                        <div id="math-val2-container">
                            <!-- JS render -->
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (step.config.col1) document.getElementById('math-col1').value = step.config.col1;
        if (step.config.op) document.getElementById('math-op').value = step.config.op;
        if (step.config.type2) document.getElementById('math-type2').value = step.config.type2;
        
        const renderVal2 = () => {
            const container = document.getElementById('math-val2-container');
            if (document.getElementById('math-type2').value === 'COLUMN') {
                container.innerHTML = `<select id="math-val2" class="form-control"><option value="">-- Chọn Cột --</option>${optHtml}</select>`;
                if (step.config.col2) document.getElementById('math-val2').value = step.config.col2;
            } else {
                container.innerHTML = `<input type="number" id="math-val2" class="form-control" placeholder="Nhập số tự do" value="${step.config.val2 || ''}">`;
            }
            // Bind internal event
            document.getElementById('math-val2').addEventListener('change', (e) => {
                if (document.getElementById('math-type2').value === 'COLUMN') step.config.col2 = e.target.value;
                else step.config.val2 = e.target.value;
                recalculatePipeline();
            });
        };
        renderVal2();

        // Bind events
        document.getElementById('math-new-col').addEventListener('input', (e) => { step.config.newColName = e.target.value; recalculatePipeline(); });
        document.getElementById('math-col1').addEventListener('change', (e) => { step.config.col1 = e.target.value; recalculatePipeline(); });
        document.getElementById('math-op').addEventListener('change', (e) => { step.config.op = e.target.value; recalculatePipeline(); });
        document.getElementById('math-type2').addEventListener('change', (e) => { 
            step.config.type2 = e.target.value; 
            renderVal2(); 
            recalculatePipeline(); 
        });
    }

    /** BƯỚC GROUP BY (PIVOT) **/
    else if (step.type === 'GROUP_BY') {
        dynamicPane.innerHTML = `
            <h3 class="config-title">Gộp Bảng (Pivot / Group By)</h3>
            <p class="config-desc">Định cấu hình cách nhóm dữ liệu giống hệt Pivot Tables.</p>
            
            <div class="row mb-16">
                <div class="col" style="max-width: 250px;">
                    <label class="form-label">Cột Key Gốc (Gom theo)</label>
                    <select id="grp-col" class="form-control"><option value="">-- Chọn --</option>${optHtml}</select>
                </div>
            </div>

            <div style="border-top: 1px solid var(--border); padding-top: 16px; margin-top: 16px;">
                <label class="form-label">Tính toán mớ (Aggregations)</label>
                <div id="agg-list" style="margin-bottom: 12px;"></div>
                
                <div class="row" style="align-items:flex-end; max-width: 500px;">
                    <div class="col">
                        <select id="agg-tgt" class="form-control"><option value="">-- Cột tính --</option>${optHtml}</select>
                    </div>
                    <div class="col">
                        <select id="agg-op" class="form-control">
                            <option value="SUM">Tổng Số (Sum)</option>
                            <option value="COUNT">Đếm Dòng (Count)</option>
                            <option value="JOIN_STRING">Nét Chuỗi Hợp Cầm (Join Text)</option>
                        </select>
                    </div>
                    <button class="btn btn-outline" style="height: 40px; margin-bottom: 2px;" id="agg-add">Thêm tính toán</button>
                </div>
            </div>
        `;
        
        // Cấu hình ban đầu
        if (step.config.groupCol) document.getElementById('grp-col').value = step.config.groupCol;
        
        // Sự kiện thay đổi Group Key
        document.getElementById('grp-col').addEventListener('change', (e) => {
            step.config.groupCol = e.target.value;
            recalculatePipeline();
        });

        // Hiển thị thẻ agg
        const aggUI = document.getElementById('agg-list');
        step.config.aggregates.forEach((a, idx) => {
            const tag = document.createElement('span'); tag.className = 'filter-tag';
            tag.innerHTML = `${a.type}(${a.col}) <button data-idx="${idx}">✕</button>`;
            aggUI.appendChild(tag);
        });

        aggUI.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') {
                step.config.aggregates.splice(e.target.dataset.idx, 1);
                recalculatePipeline();
                renderConfigPanel();
            }
        });

        document.getElementById('agg-add').addEventListener('click', () => {
            const tgt = document.getElementById('agg-tgt').value;
            const op = document.getElementById('agg-op').value;
            if (tgt) {
                step.config.aggregates.push({ col: tgt, type: op });
                recalculatePipeline();
                renderConfigPanel();
            }
        });
    }

    /** BƯỚC XUẤT VÀ CHỌN CỘT **/
    else if (step.type === 'SELECT_COLUMNS') {
        dynamicPane.innerHTML = `
            <h3 class="config-title">Xào Cột (Select / Rename)</h3>
            <p class="config-desc">Chọn và đổi tên các cột xuất báo cáo. Chỉ những cột được định nghĩa ở đây mới được xuất.</p>
            
            <div id="col-list" style="margin-bottom: 16px;"></div>

            <div class="row" style="align-items:flex-end;">
                <div class="col">
                    <label class="form-label">Chọn Cột Lấy</label>
                    <select id="sel-col" class="form-control"><option value="">-- Chọn --</option>${optHtml}</select>
                </div>
                <div class="col">
                    <label class="form-label">Tên Tuỳ Biến (Để trống nếu giữ nguyên)</label>
                    <input type="text" id="sel-new" class="form-control" placeholder="Tên Output Mới">
                </div>
                <button class="btn btn-primary" style="height: 40px; margin-bottom: 2px;" id="sel-add">Chọn Xuất</button>
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
        dynamicPane.innerHTML = `
            <h3 class="config-title">Trộn File (Hành động VLOOKUP)</h3>
            <p class="config-desc">Tải 1 file phụ để đập thông tin từ file phụ đó sang file chính. Hỗ trợ Left Join.</p>
            
            <div class="row" style="margin-bottom: 16px;">
                <div class="col">
                    <button class="btn btn-outline" id="btn-vlookup-file">Tải File Mapping Lên</button>
                    <input type="file" id="vlookup-file" accept=".xlsx" hidden>
                    <span id="vlk-filename" style="margin-left: 10px; font-size: 13px; color: var(--success);">${step.config.lookupData ? "Đã tải bộ nhớ Map ✓" : "Chưa tải"}</span>
                </div>
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
            document.getElementById('vlk-flag-col').addEventListener('input', (e) => { step.config.flagColName = e.target.value; recalculatePipeline(); });
        }

        // File upload vlookup
        document.getElementById('btn-vlookup-file').addEventListener('click', () => document.getElementById('vlookup-file').click());
        document.getElementById('vlookup-file').addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                document.getElementById('global-loading').classList.remove('hidden');
                document.getElementById('global-loading-text').innerText = "Đang rải file Index cho VLOOKUP...";
                try {
                    const result = await readExcelFile(e.target.files[0]);
                    step.config.lookupData = result.data; // Cache json ngay trên ram config bước này
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
    
    setTimeout(() => {
        try {
             exportPipelineResult(finalData, `DataX_Output_${Date.now()}.xlsx`);
        } catch(e) {
            alert("Lỗi xuất file: " + e.message);
        } finally {
            document.getElementById('global-loading').classList.add('hidden');
        }
    }, 100);
});

// INITIALIZE
renderPipelineSteps();
