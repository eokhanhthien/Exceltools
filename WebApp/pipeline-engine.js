/* XÚC TÁC LÕI - DATA PIPELINE ENGINE */

function removeVietnameseTones(str) {
    if (!str) return "";
    return str.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

// Logic so sánh chung (Dùng cho Filter và Conditional Column)
function checkSingleCondition(cellVal, op, targetVal) {
    const v1 = (cellVal === undefined || cellVal === null) ? "" : String(cellVal).trim();
    const v2 = (targetVal === undefined || targetVal === null) ? "" : String(targetVal).trim();

    // Kiểm tra ô trống
    if (op === 'IS_EMPTY') return v1 === "";
    if (op === 'NOT_EMPTY') return v1 !== "";

    // Thử so sánh số
    const num1 = parseFloat(v1.replace(/,/g, ''));
    const num2 = parseFloat(v2.replace(/,/g, ''));
    const isNum = !isNaN(num1) && !isNaN(num2);

    if (isNum) {
        if (op === 'EQUALS' || op === '=') return num1 === num2;
        if (op === 'NOT_EQUALS' || op === '!=') return num1 !== num2;
        if (op === 'GREATER_THAN' || op === '>') return num1 > num2;
        if (op === 'LESS_THAN' || op === '<') return num1 < num2;
        if (op === 'GREATER_EQUAL' || op === '>=') return num1 >= num2;
        if (op === 'LESS_EQUAL' || op === '<=') return num1 <= num2;
    }

    // So sánh chuỗi (In hoa để không phân biệt)
    const s1 = v1.toUpperCase();
    const s2 = v2.toUpperCase();

    if (op === 'EQUALS' || op === '=') return s1 === s2;
    if (op === 'NOT_EQUALS' || op === '!=') return s1 !== s2;
    if (op === 'CONTAINS') return s1.includes(s2);
    if (op === 'GREATER_THAN' || op === '>') return s1 > s2;
    if (op === 'LESS_THAN' || op === '<') return s1 < s2;

    return false;
}

// Parsing data từ SheetJS worksheet với font-aware repair (Chunking)
async function extractSheetData(worksheet, headerRowIndex = 0, autoFixFonts = true, encodingType = 'AUTO') {
    // sheet_to_json với header: 1 sẽ trả về mảng 2 chiều (bảng tính thô)
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
    if (rawRows.length <= headerRowIndex) {
        return { headers: [], data: [], detectedEncoding: 'NONE' };
    }

    const headers = rawRows[headerRowIndex].map((h, idx) => {
        let val = String(h || "").trim();
        return val || `Column${idx + 1}`;
    });

    const data = [];
    let sampleForDetect = [];
    
    // Chunking settings
    const CHUNK_SIZE = 5000;
    
    for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
        const rawRow = rawRows[i];
        
        // Bỏ qua dòng trống hoàn toàn nếu mọi cell đều rỗng
        if (rawRow.every(cell => cell === "")) continue;

        const rowData = {};
        headers.forEach((header, index) => {
            const val = rawRow[index];
            rowData[header] = (val === null || val === undefined) ? "" : val;
        });
        
        data.push(rowData);
        
        // Thu thập 100 dòng đầu tiên để test Font
        if (autoFixFonts && sampleForDetect.length < 100) {
            sampleForDetect.push(rowData);
        }

        // Nhường quyền cho Browser mỗi 5000 dòng để UI không bị treo
        if (i % CHUNK_SIZE === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    let finalDetected = 'NONE';
    if (autoFixFonts && data.length > 0 && typeof VietEncoder !== 'undefined') {
        // Chỉ dò mẫu trên 100 dòng đầu thay vì 200k dòng
        finalDetected = (encodingType === 'AUTO') ? VietEncoder.detect(sampleForDetect) : encodingType;
        
        // Nếu phát hiện lỗi thì chạy Fix, và cũng chia Chunk
        if (finalDetected !== 'NONE') {
            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                for (let key in row) {
                    if (typeof row[key] === 'string' && row[key].length > 0) {
                        row[key] = VietEncoder.fix(row[key], finalDetected);
                    }
                }
                
                // Nhường quyền cho Browser mỗi 5000 dòng
                if (i % CHUNK_SIZE === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
            
            // Fix header
            for (let i = 0; i < headers.length; i++) {
                headers[i] = VietEncoder.fix(headers[i], finalDetected);
            }
        }
    }

    return { headers, data, detectedEncoding: finalDetected };
}

// Đọc file -> Json Array (Sử dụng SheetJS - Tối ưu 200k+ dòng)
async function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const buffer = new Uint8Array(e.target.result);
                // Đọc workbook bằng SheetJS, bỏ qua các style phức tạp để load siêu tốc
                const workbook = XLSX.read(buffer, { type: 'array' });
                
                const sheetNames = workbook.SheetNames;
                
                // Trích xuất sheet đầu tiên mặc định
                const firstSheetName = sheetNames[0];
                const firstSheet = workbook.Sheets[firstSheetName];
                const firstSheetResult = await extractSheetData(firstSheet, 0);

                resolve({
                    fileName: file.name,
                    workbook: workbook,              // Cache lại SheetJS workbook
                    sheetNames: sheetNames, 
                    sheetsData: {
                        [firstSheetName]: firstSheetResult
                    }           
                });
            } catch (err) {
                console.error("SheetJS Load Error:", err);
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
                const logicType = config.logicType || 'AND';
                result = result.filter(row => {
                    let matches = [];
                    for (const cond of config.conditions) {
                        const cellVal = String(row[cond.col] || "").trim().toUpperCase();
                        const filterVal = String(cond.val || "").trim().toUpperCase();
                        
                        let condMatch = false;
                        if (cond.op === 'CONTAINS') condMatch = cellVal.includes(filterVal);
                        else if (cond.op === 'EQUALS') condMatch = (cellVal === filterVal);
                        else if (cond.op === 'NOT_EQUALS') condMatch = (cellVal !== filterVal);
                        else if (cond.op === 'STARTS_WITH') condMatch = cellVal.startsWith(filterVal);
                        else if (cond.op === 'IN') {
                            const list = filterVal.split(/[,;]/).map(s => s.trim()).filter(s => s !== "");
                            condMatch = list.includes(cellVal);
                        }
                        
                        matches.push(condMatch);
                    }

                    if (logicType === 'OR') return matches.some(m => m === true);
                    return matches.every(m => m === true);
                });
            }
        } 
        
        else if (step.type === 'MATH_COMPUTE') {
            const newCol = (config.newColName && config.newColName.trim() !== '') ? config.newColName : 'Kết Quả Tính';
            const expr = config.expression || "";

            result = result.map(row => {
                const newRow = { ...row };
                if (!expr) {
                    newRow[newCol] = 0;
                    return newRow;
                }

                // Thay thế [Tên Cột] bằng giá trị số thực tế
                const safeExpr = expr.replace(/\[([^\]]+)\]/g, (match, colName) => {
                    const val = parseFloat(row[colName]);
                    return isNaN(val) ? 0 : val;
                });

                try {
                    // Dùng Function để tính toán chuỗi an toàn trong nội bộ
                    const res = new Function(`return ${safeExpr}`)();
                    newRow[newCol] = typeof res === 'number' ? res : 0;
                } catch (e) {
                    newRow[newCol] = 0;
                }
                return newRow;
            });
        }

        else if (step.type === 'CONDITIONAL_COLUMN') {
            const targetCol = (config.newColName && config.newColName.trim() !== "") ? config.newColName : `Cột Mới (IF)`;
            
            result = result.map(row => {
                const newRow = { ...row };
                let finalVal = config.elseVal;
                if (config.elseType === 'COLUMN') finalVal = row[config.elseVal] || "";

                // Duyệt từng bộ Luật (Rules)
                for (const rule of (config.rules || [])) {
                    let rulePassed = true; 
                    if (!rule.conditions || rule.conditions.length === 0) continue;

                    rule.conditions.forEach((cond, idx) => {
                        const cellVal = row[cond.col];
                        let compVal = cond.val;
                        if (cond.type === 'COLUMN') compVal = row[cond.val];

                        const isMatch = checkSingleCondition(cellVal, cond.op, compVal);

                        if (idx === 0) {
                            rulePassed = isMatch;
                        } else {
                            if (cond.logic === 'AND') rulePassed = rulePassed && isMatch;
                            else if (cond.logic === 'OR') rulePassed = rulePassed || isMatch;
                        }
                    });

                    if (rulePassed) {
                        finalVal = rule.thenType === 'COLUMN' ? row[rule.thenVal] : rule.thenVal;
                        break; // Dừng lại ở luật đầu tiên khớp
                    }
                }
                newRow[targetCol] = finalVal;
                return newRow;
            });
        }

        else if (step.type === 'VLOOKUP') {
            if (config.lookupData && config.baseKey && config.lookupKey) {
                const lookupMap = new Map();
                for (const lRow of config.lookupData) {
                    const k = String(lRow[config.lookupKey] || "").trim().toUpperCase();
                    if (!lookupMap.has(k)) {
                        lookupMap.set(k, lRow);
                    }
                }

                result = result.map(row => {
                    const newRow = { ...row };
                    const k = String(row[config.baseKey] || "").trim().toUpperCase();
                    const match = lookupMap.get(k);
                    
                    if (config.enableFlag) {
                        const fCol = config.flagColName || 'Trang_Thai_Khop';
                        newRow[fCol] = match ? "Có" : "Không";
                    }

                    for (const grabCol of (config.grabColumns || [])) {
                        let targetName = config.prefix ? `${config.prefix}_${grabCol}` : grabCol;
                        let suffix = 2;
                        let originalName = targetName;
                        while (row[targetName] !== undefined) {
                            targetName = `${originalName}_File${suffix}`;
                            if (row[targetName] === undefined) break;
                            suffix++;
                        }

                        if (match) {
                            newRow[targetName] = match[grabCol];
                        } else {
                            newRow[targetName] = config.joinType === 'INNER' ? null : "";
                        }
                    }
                    return newRow;
                });

                if (config.joinType === 'INNER') {
                    result = result.filter(row => {
                        const k = String(row[config.baseKey] || "").trim().toUpperCase();
                        return lookupMap.has(k);
                    });
                } else if (config.joinType === 'ANTI') {
                    result = result.filter(row => {
                        const k = String(row[config.baseKey] || "").trim().toUpperCase();
                        return !lookupMap.has(k);
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
                        for (const agg of (config.aggregates || [])) {
                            const internalKey = `__${agg.type}__${agg.col}`;
                            if (agg.type === 'SUM' || agg.type === 'COUNT') initObj[internalKey] = 0;
                            if (agg.type === 'JOIN_STRING') initObj[internalKey] = new Set();
                        }
                        groupMap.set(k, initObj);
                    }

                    const mapItem = groupMap.get(k);
                    for (const agg of (config.aggregates || [])) {
                        const val = row[agg.col];
                        const internalKey = `__${agg.type}__${agg.col}`;
                        if (agg.type === 'SUM') {
                            let num = parseFloat(val);
                            if (!isNaN(num)) mapItem[internalKey] += num;
                        } else if (agg.type === 'COUNT') {
                            if (val !== undefined && val !== "") mapItem[internalKey] += 1;
                        } else if (agg.type === 'JOIN_STRING') {
                            if (val && String(val).trim() !== "") mapItem[internalKey].add(String(val).trim());
                        }
                    }
                }

                result = Array.from(groupMap.values()).map(row => {
                    const finalRow = {};
                    finalRow[config.groupCol] = row[config.groupCol];
                    for (const agg of (config.aggregates || [])) {
                        const internalKey = `__${agg.type}__${agg.col}`;
                        let outName = agg.col;
                        if (agg.type === 'SUM') outName = `Tổng_${agg.col}`;
                        else if (agg.type === 'COUNT') outName = `Đếm_${agg.col}`;
                        else if (agg.type === 'JOIN_STRING') outName = agg.col;

                        if (agg.type === 'JOIN_STRING') {
                            finalRow[outName] = Array.from(row[internalKey]).join(" | ");
                        } else {
                            finalRow[outName] = row[internalKey];
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
                        newRow[colMap.newName || colMap.oldName] = row[colMap.oldName];
                    }
                    return newRow;
                });
            }
        }

        else if (step.type === 'COMPARE') {
            if (config.compareData && config.baseKey && config.compareKey && config.baseCompareCol && config.secondaryCompareCol) {
                const compareMap = new Map();
                for (const lRow of config.compareData) {
                    const k = String(lRow[config.compareKey] || "").trim().toUpperCase();
                    if (!compareMap.has(k)) {
                        compareMap.set(k, lRow);
                    }
                }

                let comparedResult = [];

                for (const row of result) {
                    const k = String(row[config.baseKey] || "").trim().toUpperCase();
                    const secRow = compareMap.get(k);

                    if (secRow) {
                        // Trích xuất số tiền để tính biến động
                        let v1 = parseFloat(String(row[config.baseCompareCol]).replace(/,/g, ''));
                        let v2 = parseFloat(String(secRow[config.secondaryCompareCol]).replace(/,/g, ''));
                        v1 = isNaN(v1) ? 0 : v1;
                        v2 = isNaN(v2) ? 0 : v2;

                        const diff = v2 - v1; // Chênh lệch (Sau - Trước)
                        const absDiff = Math.abs(diff);

                        const newRow = {};
                        newRow[config.baseKey] = row[config.baseKey]; // CIF
                        newRow[`${config.baseCompareCol} (Trước)`] = v1;
                        newRow[`${config.baseCompareCol} (Sau)`] = v2;
                        newRow[`Biến động (+/-)`] = diff;

                        // Chuyển lại giá trị absDiff ngầm để phục vụ filter/sort
                        newRow.__absDiff = absDiff;

                        // Các cột còn lại (gộp Text - lấy từ Base)
                        for (const key in row) {
                            if (key !== config.baseKey && key !== config.baseCompareCol) {
                                newRow[key] = row[key];
                            }
                        }

                        comparedResult.push(newRow);
                    }
                }

                // Áp dụng điều kiện lọc biến động
                if (config.conditionType === 'THRESHOLD_INC') {
                    const threshold = parseFloat(config.diffThreshold) || 0;
                    comparedResult = comparedResult.filter(r => r['Biến động (+/-)'] >= Math.abs(threshold));
                } else if (config.conditionType === 'THRESHOLD_DEC') {
                    const threshold = parseFloat(config.diffThreshold) || 0;
                    comparedResult = comparedResult.filter(r => r['Biến động (+/-)'] <= -Math.abs(threshold));
                } else if (config.conditionType === 'TOP_X_INC') {
                    const limit = parseInt(config.topXValue) || 10;
                    comparedResult.sort((a, b) => b['Biến động (+/-)'] - a['Biến động (+/-)']);
                    comparedResult = comparedResult.slice(0, limit);
                } else if (config.conditionType === 'TOP_X_DEC') {
                    const limit = parseInt(config.topXValue) || 10;
                    comparedResult.sort((a, b) => a['Biến động (+/-)'] - b['Biến động (+/-)']);
                    comparedResult = comparedResult.slice(0, limit);
                } else if (config.conditionType === 'THRESHOLD') {
                    // Backwards compatibility with old absolute Threshold
                    const threshold = parseFloat(config.diffThreshold) || 0;
                    comparedResult = comparedResult.filter(r => r.__absDiff >= threshold);
                } else if (config.conditionType === 'TOP_X') {
                    // Backwards backward compatibility with old absolute Top X
                    const limit = parseInt(config.topXValue) || 10;
                    comparedResult.sort((a, b) => b.__absDiff - a.__absDiff);
                    comparedResult = comparedResult.slice(0, limit);
                }

                // Xoá cột tạm __absDiff
                comparedResult.forEach(r => delete r.__absDiff);

                result = comparedResult;
            }
        }
    } catch (e) {
        console.error("Pipeline Engine Error:", e);
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

// Hàm export kết quả (Sử dụng ExcelJS)
async function exportPipelineResult(dataArray, fileName) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Data');
    
    if (dataArray.length > 0) {
        // Thiết lập header và dữ liệu
        const headers = Object.keys(dataArray[0]);
        worksheet.columns = headers.map(h => ({ header: h, key: h }));
        worksheet.addRows(dataArray);
        
        // Style cho header (Đậm, màu nền nhẹ)
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF0F0F0' }
        };
    }
    
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
}

