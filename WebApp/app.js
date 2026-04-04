
// ---- GLOBAL STATE ----
const state = {
    processWorkbook: null,
    processFileName: "",
    processFilters: [], // { colIndex, colName, value }
    processResult: null,

    oldWorkbook: null,
    newWorkbook: null,
    oldFileName: "",
    newFileName: "",
    compareResult: null
};

// ---- TAB SWITCHING ----
document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
        
        item.classList.add('active');
        document.getElementById(`${item.dataset.tab}-tab`).classList.remove('hidden');
    });
});

// ---- FILE DROP UTILS ----
function setupDropZone(dropZoneId, inputId, onFileLoaded) {
    const dropZone = document.getElementById(dropZoneId);
    const input = document.getElementById(inputId);

    // Kích hoạt input khi click
    dropZone.addEventListener('click', () => input.click());

    // Xử lý kéo thả
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            onFileLoaded(e.dataTransfer.files[0]);
        }
    });

    // Xử lý chọn file
    input.addEventListener('change', (e) => {
        if (e.target.files.length) {
            onFileLoaded(e.target.files[0]);
        }
    });
}

function formatSize(bytes) {
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// ==========================================
// TAB 1: PROCESS
// ==========================================
setupDropZone('drop-zone-process', 'file-process', async (file) => {
    try {
        const loading = document.getElementById('process-loading');
        loading.classList.remove('hidden');
        document.getElementById('process-status').innerText = "Đang đọc cấu trúc file...";
        
        state.processFileName = file.name;
        state.processWorkbook = await readWorkbook(file);
        
        // Show file info
        document.getElementById('process-filename').textContent = file.name;
        document.getElementById('process-filesize').textContent = formatSize(file.size);
        document.getElementById('drop-zone-process').classList.add('hidden');
        document.getElementById('file-info-process').classList.remove('hidden');

        // Populate dropdown
        const headers = getHeaders(state.processWorkbook);
        const select = document.getElementById('column-select');
        select.innerHTML = '<option value="">-- Chọn cột để lọc --</option>';
        headers.forEach(h => {
            const opt = document.createElement('option');
            opt.value = h.index;
            opt.textContent = `${h.index}: ${h.name} (${h.cleanedName})`;
            select.appendChild(opt);
        });

        document.getElementById('filter-section').classList.remove('hidden');
        document.getElementById('process-actions').classList.remove('hidden');

    } catch (e) {
        alert("Lỗi đọc file: " + e.message);
    } finally {
        document.getElementById('process-loading').classList.add('hidden');
    }
});

document.getElementById('btn-remove-process').addEventListener('click', () => {
    state.processWorkbook = null;
    document.getElementById('file-process').value = "";
    document.getElementById('drop-zone-process').classList.remove('hidden');
    document.getElementById('file-info-process').classList.add('hidden');
    document.getElementById('filter-section').classList.add('hidden');
    document.getElementById('process-actions').classList.add('hidden');
    document.getElementById('process-result').classList.add('hidden');
    state.processFilters = [];
    renderFilters();
});

// Thêm bộ lọc
document.getElementById('btn-add-filter').addEventListener('click', () => {
    const select = document.getElementById('column-select');
    const input = document.getElementById('filter-value');
    
    if (select.value === "" || input.value.trim() === "") return;
    
    state.processFilters.push({
        colIndex: parseInt(select.value),
        colName: select.options[select.selectedIndex].text,
        value: input.value.trim()
    });
    
    input.value = "";
    renderFilters();
});

function renderFilters() {
    const container = document.getElementById('filters-container');
    container.innerHTML = "";
    
    state.processFilters.forEach((f, idx) => {
        const div = document.createElement('div');
        div.className = "filter-item";
        div.innerHTML = `
            <div class="filter-info">
                <span class="filter-col">${f.colName}</span>
                <span style="color:var(--text-muted)">chứa</span>
                <span class="filter-val">${f.value}</span>
            </div>
            <button class="btn-remove-filter" data-idx="${idx}">✕</button>
        `;
        container.appendChild(div);
    });

    document.querySelectorAll('.btn-remove-filter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.dataset.idx);
            state.processFilters.splice(idx, 1);
            renderFilters();
        });
    });
}

function updateProgress(percent) {
    document.getElementById('process-progress').style.width = percent + '%';
    document.getElementById('process-status').innerText = `Đang gộp thẻ... ${percent}%`;
}

document.getElementById('btn-run-process').addEventListener('click', async () => {
    if (!state.processWorkbook) return;
    
    document.getElementById('process-loading').classList.remove('hidden');
    document.getElementById('process-actions').classList.add('hidden');
    document.getElementById('process-status').innerText = "Đang gộp và tính tổng...";
    document.getElementById('process-progress').style.width = '0%';
    document.getElementById('process-result').classList.add('hidden');

    // Chạy trong setTimeout để UI kịp update Loading frame
    setTimeout(async () => {
        try {
            state.processResult = await processData(state.processWorkbook, state.processFilters, updateProgress);
            
            // Render Table
            const tbody = document.querySelector('#process-table tbody');
            tbody.innerHTML = "";
            
            const limit = Math.min(100, state.processResult.length); // Chỉ preview 100 dòng

            for(let i=0; i<limit; i++) {
                const item = state.processResult[i];
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${item["Tên Khách Hàng"]}</td>
                    <td>${item["CIF"]}</td>
                    <td class="text-right font-mono text-success">${item["Số Dư Tiền Gửi"].toLocaleString('en-US')}</td>
                    <td>${item["Phòng Giao Dịch"]}</td>
                `;
                tbody.appendChild(tr);
            }

            if (state.processResult.length > 100) {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td colspan="4" class="text-center text-muted">... và ${state.processResult.length - 100} dòng khác (xuất Excel để xem toàn bộ)</td>`;
                tbody.appendChild(tr);
            }

            document.getElementById('process-summary-text').innerText = `Tuyệt vời! Đã tìm thấy và gộp ${state.processResult.length.toLocaleString('en-US')} CIF.`;
            document.getElementById('process-result').classList.remove('hidden');

        } catch(e) {
            alert("Lỗi xử lý: " + e.message);
            console.error(e);
        } finally {
            document.getElementById('process-loading').classList.add('hidden');
            document.getElementById('process-actions').classList.remove('hidden');
        }
    }, 100);
});

document.getElementById('btn-export-process').addEventListener('click', () => {
    if (!state.processResult) return;
    const dateStr = new Date().toLocaleDateString('vi-VN').replace(/\//g, '_');
    exportExcel(state.processResult, `KetQua_${dateStr}.xlsx`);
});


// ==========================================
// TAB 2: COMPARE
// ==========================================
function checkCompareReady() {
    const btn = document.getElementById('btn-run-compare');
    if (state.oldWorkbook && state.newWorkbook) {
        btn.disabled = false;
    } else {
        btn.disabled = true;
    }
}

setupDropZone('drop-zone-old', 'file-old', async (file) => {
    state.oldFileName = file.name;
    document.getElementById('old-filename').textContent = file.name;
    document.getElementById('drop-zone-old').classList.add('hidden');
    document.getElementById('file-info-old').classList.remove('hidden');
    state.oldWorkbook = await readWorkbook(file);
    checkCompareReady();
});

setupDropZone('drop-zone-new', 'file-new', async (file) => {
    state.newFileName = file.name;
    document.getElementById('new-filename').textContent = file.name;
    document.getElementById('drop-zone-new').classList.add('hidden');
    document.getElementById('file-info-new').classList.remove('hidden');
    state.newWorkbook = await readWorkbook(file);
    checkCompareReady();
});

document.getElementById('btn-remove-old').addEventListener('click', () => {
    state.oldWorkbook = null;
    document.getElementById('file-old').value = "";
    document.getElementById('drop-zone-old').classList.remove('hidden');
    document.getElementById('file-info-old').classList.add('hidden');
    checkCompareReady();
});

document.getElementById('btn-remove-new').addEventListener('click', () => {
    state.newWorkbook = null;
    document.getElementById('file-new').value = "";
    document.getElementById('drop-zone-new').classList.remove('hidden');
    document.getElementById('file-info-new').classList.add('hidden');
    checkCompareReady();
});

document.getElementById('btn-run-compare').addEventListener('click', async () => {
    if (!state.oldWorkbook || !state.newWorkbook) return;
    
    document.getElementById('compare-loading').classList.remove('hidden');
    document.getElementById('compare-result').classList.add('hidden');

    setTimeout(async () => {
        try {
            const { arrayFull, topTang, topGiam } = await compareData(state.oldWorkbook, state.newWorkbook);
            state.compareResult = { topTang, topGiam }; // Lưu giữ liệu xuất Excel

            const tbody = document.querySelector('#compare-table tbody');
            tbody.innerHTML = "";
            
            // Hàm render
            const renderRows = (dataArray, badgeClass) => {
                dataArray.forEach(item => {
                    const tr = document.createElement('tr');
                    const ptText = item.phanTram !== null ? (item.phanTram * 100).toFixed(2) + "%" : "N/A";
                    tr.innerHTML = `
                        <td><span class="badge ${badgeClass}">${item.Loai}</span></td>
                        <td class="font-mono">${item.cif}</td>
                        <td>${item.tenKH}</td>
                        <td class="text-right">${item.soDuOld.toLocaleString('en-US')}</td>
                        <td class="text-right">${item.soDuNew.toLocaleString('en-US')}</td>
                        <td class="text-right ${item.chenhLech > 0 ? 'text-success' : 'text-danger'} font-bold">
                            ${item.chenhLech > 0 ? '+' : ''}${item.chenhLech.toLocaleString('en-US')}
                        </td>
                        <td class="text-right ${item.chenhLech > 0 ? 'text-success' : 'text-danger'}">${item.chenhLech > 0 ? '+' : ''}${ptText}</td>
                    `;
                    tbody.appendChild(tr);
                });
            };

            renderRows(topTang, 'badge-up');
            renderRows(topGiam, 'badge-down');

            document.getElementById('compare-summary-text').innerText = `Tổng số CIF có biến động: ${arrayFull.length.toLocaleString('en-US')}`;
            document.getElementById('compare-result').classList.remove('hidden');

        } catch (e) {
            alert("Lỗi đối chiếu (Bạn đã chắc chắn cả 2 file đều là file Kết quả đã qua Tổng hợp chưa?): " + e.message);
            console.error(e);
        } finally {
            document.getElementById('compare-loading').classList.add('hidden');
        }
    }, 100);
});

document.getElementById('btn-export-compare').addEventListener('click', () => {
    if (!state.compareResult) return;
    exportCompareExcel(state.compareResult.topTang, state.compareResult.topGiam, `BaoCao_SoSanh_${new Date().getTime()}.xlsx`);
});
