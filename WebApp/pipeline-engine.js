/* XÚC TÁC LÕI - DATA PIPELINE ENGINE */

function removeVietnameseTones(str) {
    if (!str) return "";
    return str.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

// Đọc file -> Json Array
async function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                resolve({
                    fileName: file.name,
                    headers: rawData.length > 0 ? Object.keys(rawData[0]) : [],
                    data: rawData
                });
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
}

// Xử lý từng khối Data (Pure Function)
function applyStepToData(sourceData, step) {
    let result = [...sourceData];
    const config = step.config;

    try {
        if (step.type === 'FILTER') {
            if (config.conditions && config.conditions.length > 0) {
                result = result.filter(row => {
                    let isMatch = true;
                    for (const cond of config.conditions) {
                        const cellVal = String(row[cond.col] || "").trim().toUpperCase();
                        const filterVal = String(cond.val || "").trim().toUpperCase();
                        
                        if (cond.op === 'CONTAINS' && !cellVal.includes(filterVal)) isMatch = false;
                        if (cond.op === 'EQUALS' && cellVal !== filterVal) isMatch = false;
                        if (cond.op === 'NOT_EQUALS' && cellVal === filterVal) isMatch = false;
                        if (cond.op === 'STARTS_WITH' && !cellVal.startsWith(filterVal)) isMatch = false;
                    }
                    return isMatch;
                });
            }
        } 
        
        else if (step.type === 'VLOOKUP') {
            if (config.lookupData && config.baseKey && config.lookupKey) {
                // Tối ưu Vlookup bằng Map Index O(1) thay cho 2 vòng lặp lồng nhau
                const lookupMap = new Map();
                for (const lRow of config.lookupData) {
                    const k = String(lRow[config.lookupKey] || "").trim().toUpperCase();
                    if (!lookupMap.has(k)) {
                        lookupMap.set(k, lRow); // Lấy dòng đầu tiên match
                    }
                }

                result = result.map(row => {
                    const newRow = { ...row };
                    const k = String(row[config.baseKey] || "").trim().toUpperCase();
                    const match = lookupMap.get(k);
                    
                    for (const grabCol of (config.grabColumns || [])) {
                        const targetName = config.prefix ? `${config.prefix}_${grabCol}` : grabCol;
                        if (match) {
                            newRow[targetName] = match[grabCol];
                        } else {
                            // Left Join: Không thấy thì trả về N/A hoặc rỗng tuỳ cấu hình
                            newRow[targetName] = config.joinType === 'INNER' ? null : "";
                        }
                    }
                    return newRow;
                });

                // Nếu là Inner Join, loại bỏ các row không có match map
                if (config.joinType === 'INNER') {
                    result = result.filter(row => {
                        const k = String(row[config.baseKey] || "").trim().toUpperCase();
                        return lookupMap.has(k);
                    });
                }
            }
        }

        else if (step.type === 'GROUP_BY') {
            if (config.groupCol) {
                const groupMap = new Map();
                
                for (const row of result) {
                    const k = String(row[config.groupCol] || "").trim();
                    if (k === "") continue;

                    if (!groupMap.has(k)) {
                        const initObj = {};
                        initObj[config.groupCol] = row[config.groupCol];
                        // Khởi tạo các biến gộp
                        for (const agg of (config.aggregates || [])) {
                            if (agg.type === 'SUM' || agg.type === 'COUNT') initObj[agg.col] = 0;
                            if (agg.type === 'JOIN_STRING') initObj[agg.col] = new Set();
                        }
                        groupMap.set(k, initObj);
                    }

                    const mapItem = groupMap.get(k);
                    
                    for (const agg of (config.aggregates || [])) {
                        const val = row[agg.col];
                        if (agg.type === 'SUM') {
                            let num = parseFloat(val);
                            if (!isNaN(num)) mapItem[agg.col] += num;
                        } else if (agg.type === 'COUNT') {
                            if (val !== undefined && val !== "") mapItem[agg.col] += 1;
                        } else if (agg.type === 'JOIN_STRING') {
                            if (val && String(val).trim() !== "") mapItem[agg.col].add(String(val).trim());
                        }
                    }
                }

                // Chuyển set về chuỗi
                result = Array.from(groupMap.values()).map(row => {
                    const finalRow = { ...row };
                    for (const agg of (config.aggregates || [])) {
                        if (agg.type === 'JOIN_STRING') {
                            finalRow[agg.col] = Array.from(row[agg.col]).join(", ");
                        }
                    }
                    return finalRow;
                });
            }
        }

        else if (step.type === 'SELECT_COLUMNS') {
            if (config.columns && config.columns.length > 0) {
                result = result.map(row => {
                    const newRow = {};
                    for (const colMap of config.columns) {
                        // colMap: { oldName: 'CIF', newName: 'MaKhachHang' }
                        newRow[colMap.newName || colMap.oldName] = row[colMap.oldName];
                    }
                    return newRow;
                });
            }
        }
    } catch (e) {
        console.error("Lỗi khi chạy Pipeline Step " + step.id, e);
        throw e;
    }

    return result;
}

// Chạy lại toán bộ ống từ đầu
async function runFullPipeline(rootData, steps) {
    let currentData = [...rootData];
    
    for (const step of steps) {
        if (!step.disabled) {
            currentData = applyStepToData(currentData, step);
        }
    }
    
    return currentData;
}

// Hàm format cột tuỳ chọn
function exportPipelineResult(dataArray, fileName) {
    const ws = XLSX.utils.json_to_sheet(dataArray);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, fileName);
}
