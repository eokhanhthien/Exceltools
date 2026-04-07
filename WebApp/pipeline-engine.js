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

// Parsing data từ ExcelJS worksheet với font-aware repair
async function extractSheetData(worksheet, headerRowIndex = 0, autoFixFonts = true, encodingType = 'AUTO') {
    const data = [];
    let headers = [];

    // Lấy dòng tiêu đề (Dòng 1 trong ExcelJS là Index 1)
    const headerRow = worksheet.getRow(headerRowIndex + 1);
    
    // Thu thập Headers
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        let val = cell.text || "";
        
        // Nhận diện font để sửa lỗi (Font-Aware)
        const fontName = cell.font && cell.font.name ? cell.font.name : "";
        if (autoFixFonts) {
            if (fontName.startsWith('.Vn')) {
                val = VietEncoder.fix(val, 'TCVN3');
            } else if (fontName.startsWith('VNI')) {
                val = VietEncoder.fix(val, 'VNI');
            }
        }
        
        headers[colNumber - 1] = val || `Column${colNumber}`;
    });

    // Duyệt dữ liệu từ dòng sau Header
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber <= headerRowIndex + 1) return;

        const rowData = {};
        headers.forEach((header, index) => {
            const cell = row.getCell(index + 1);
            let val = cell.value;
            
            // Xử lý Rich Text (Mảng các fragment có font riêng)
            if (val && val.richText) {
                val = val.richText.map(rt => {
                    let text = rt.text || "";
                    const fName = (rt.font && rt.font.name) ? rt.font.name.toUpperCase() : "";
                    if (autoFixFonts) {
                        if (fName.includes('.VN')) text = VietEncoder.fix(text, 'TCVN3');
                        else if (fName.includes('VNI')) text = VietEncoder.fix(text, 'VNI');
                    }
                    return text;
                }).join("");
            } 
            // Xử lý công thức (formula)
            else if (val && typeof val === 'object' && val.result !== undefined) {
                val = val.result;
            }

            // Sửa lỗi Font dựa trên style của Ô (Cell Formatting) - Nếu không phải Rich Text
            if (!cell.value || !cell.value.richText) {
                const fontName = (cell.font && cell.font.name) ? cell.font.name.toUpperCase() : "";
                if (autoFixFonts && typeof val === 'string' && val !== "") {
                    if (fontName.includes('.VN')) {
                        val = VietEncoder.fix(val, 'TCVN3');
                    } else if (fontName.includes('VNI')) {
                        val = VietEncoder.fix(val, 'VNI');
                    }
                }
            }

            rowData[header] = val === null || val === undefined ? "" : val;
        });
        data.push(rowData);
    });

    // Phân tích bổ sung (Nếu nạp CSV hoặc Font info bị mất)
    let finalDetected = 'NONE';
    if (autoFixFonts && data.length > 0 && typeof VietEncoder !== 'undefined') {
        const detected = (encodingType === 'AUTO') ? VietEncoder.detect(data) : encodingType;
        if (detected !== 'NONE') {
            finalDetected = detected;
            data.forEach(row => {
                for (let key in row) {
                    if (typeof row[key] === 'string') row[key] = VietEncoder.fix(row[key], detected);
                }
            });
            headers = headers.map(h => VietEncoder.fix(h, detected));
        }
    }

    return { headers, data, detectedEncoding: finalDetected };
}

// Đọc file -> Json Array (Sử dụng ExcelJS)
async function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const buffer = e.target.result;
                const workbook = new ExcelJS.Workbook();
                await workbook.xlsx.load(buffer);
                
                const sheetsData = {};
                const sheetNames = [];
                
                workbook.eachSheet(async (worksheet) => {
                    sheetNames.push(worksheet.name);
                    // Lưu ý: eachSheet trong ExcelJS có thể gây race condition nếu không await
                    // Nhưng ở đây ta trích xuất đồng bộ từng sheet cho đơn giản
                });

                // Trích xuất sheet đầu tiên mặc định
                const firstSheet = workbook.getWorksheet(sheetNames[0]);
                const firstSheetResult = await extractSheetData(firstSheet, 0);

                resolve({
                    fileName: file.name,
                    workbook: workbook,              // Cache lại ExcelJS workbook
                    sheetNames: sheetNames, 
                    sheetsData: {
                        [sheetNames[0]]: firstSheetResult
                    }           
                });
            } catch (err) {
                console.error("ExcelJS Load Error:", err);
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
                        else if (agg.type === 'JOIN_STRING') outName = `Chuỗi_${agg.col}`;

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

