/* XÚC TÁC LÕI - DATA PIPELINE ENGINE */

function removeVietnameseTones(str) {
    if (!str) return "";
    return str.toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

function checkSingleCondition(cellVal, op, targetVal) {
    const v1 = (cellVal === undefined || cellVal === null) ? "" : String(cellVal).trim();
    const v2 = (targetVal === undefined || targetVal === null) ? "" : String(targetVal).trim();
    if (op === 'IS_EMPTY') return v1 === "";
    if (op === 'NOT_EMPTY') return v1 !== "";
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
    const s1 = v1.toUpperCase();
    const s2 = v2.toUpperCase();
    if (op === 'EQUALS' || op === '=') return s1 === s2;
    if (op === 'NOT_EQUALS' || op === '!=') return s1 !== s2;
    if (op === 'CONTAINS') return s1.includes(s2);
    if (op === 'STARTS_WITH') return s1.startsWith(s2);
    return false;
}

function applyStepToData(sourceData, step) {
    // GUARD: Luôn đảm bảo sourceData là mảng
    let result = Array.isArray(sourceData) ? [...sourceData] : [];
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
                    return logicType === 'OR' ? matches.some(m => m === true) : matches.every(m => m === true);
                });
            }
        } else if (step.type === 'MATH_COMPUTE') {
            const newCol = (config.newColName && config.newColName.trim() !== '') ? config.newColName : 'Kết Quả';
            const expr = config.expression || "";
            result = result.map(row => {
                const newRow = { ...row };
                if (!expr) { newRow[newCol] = 0; return newRow; }
                const safeExpr = expr.replace(/\[([^\]]+)\]/g, (match, colName) => {
                    const val = parseFloat(row[colName]);
                    return isNaN(val) ? 0 : val;
                });
                try {
                    const res = new Function(`return ${safeExpr}`)();
                    newRow[newCol] = typeof res === 'number' ? res : 0;
                } catch (e) { newRow[newCol] = 0; }
                return newRow;
            });
        } else if (step.type === 'VLOOKUP') {
            if (config.lookupData && config.baseKey && config.lookupKey) {
                const lookupMap = new Map();
                config.lookupData.forEach(lRow => {
                    const k = String(lRow[config.lookupKey] || "").trim().toUpperCase();
                    if (!lookupMap.has(k)) lookupMap.set(k, lRow);
                });
                result = result.map(row => {
                    const newRow = { ...row };
                    const k = String(row[config.baseKey] || "").trim().toUpperCase();
                    const match = lookupMap.get(k);
                    if (config.enableFlag) newRow[config.flagColName || 'Khớp?'] = match ? "Có" : "Không";
                    (config.grabColumns || []).forEach(grabCol => {
                        let targetName = config.prefix ? `${config.prefix}_${grabCol}` : grabCol;
                        newRow[targetName] = match ? match[grabCol] : "";
                    });
                    return newRow;
                });
                if (config.joinType === 'INNER') result = result.filter(row => lookupMap.has(String(row[config.baseKey] || "").trim().toUpperCase()));
            }
        } else if (step.type === 'GROUP_BY') {
            if (config.groupCol) {
                const groupMap = new Map();
                result.forEach(row => {
                    const k = String(row[config.groupCol] || "").trim();
                    if (k === "") return;
                    if (!groupMap.has(k)) {
                        const initObj = { [config.groupCol]: row[config.groupCol] };
                        (config.aggregates || []).forEach(agg => {
                            const internalKey = `__${agg.type}__${agg.col}`;
                            if (agg.type === 'SUM' || agg.type === 'COUNT') initObj[internalKey] = 0;
                            if (agg.type === 'JOIN_STRING') initObj[internalKey] = new Set();
                        });
                        groupMap.set(k, initObj);
                    }
                    const mapItem = groupMap.get(k);
                    (config.aggregates || []).forEach(agg => {
                        const val = row[agg.col];
                        const internalKey = `__${agg.type}__${agg.col}`;
                        if (agg.type === 'SUM') {
                            let num = parseFloat(String(val).replace(/,/g, ''));
                            if (!isNaN(num)) mapItem[internalKey] += num;
                        } else if (agg.type === 'COUNT') {
                            if (val !== undefined && val !== "") mapItem[internalKey] += 1;
                        } else if (agg.type === 'JOIN_STRING') {
                            if (val && String(val).trim() !== "") mapItem[internalKey].add(String(val).trim());
                        }
                    });
                });
                result = Array.from(groupMap.values()).map(row => {
                    const finalRow = { [config.groupCol]: row[config.groupCol] };
                    (config.aggregates || []).forEach(agg => {
                        const internalKey = `__${agg.type}__${agg.col}`;
                        let outName = agg.newName || (agg.type === 'SUM' ? `Tổng_${agg.col}` : agg.type === 'COUNT' ? `Đếm_${agg.col}` : agg.col);
                        finalRow[outName] = (agg.type === 'JOIN_STRING') ? Array.from(row[internalKey]).join(" | ") : row[internalKey];
                    });
                    return finalRow;
                });
            }
        }
    } catch (e) { console.error("Engine Error:", e); }
    return result;
}

// Hàm làm sạch một giá trị ô Excel (xử lý richText, formula, hyperlink object)
function _sanitizeCellVal(val) {
    if (val === null || val === undefined) return '';
    if (val instanceof Date) return val;
    if (typeof val !== 'object') return val;
    // ExcelJS formula cell: { formula, result }
    if (val.result !== undefined) return _sanitizeCellVal(val.result);
    // ExcelJS rich text: { richText: [{text:'...'},...] }
    if (Array.isArray(val.richText)) return val.richText.map(r => r.text || '').join('');
    // ExcelJS hyperlink: { text, hyperlink }
    if (val.text !== undefined) return val.text;
    return String(val);
}

const WORKER_CODE = `
    const checkSingleCondition = ${checkSingleCondition.toString()};
    const applyStepToData = ${applyStepToData.toString()};

    self.onmessage = async function(e) {
        // *** KHAI BÁO msgId NGAY TỪ ĐẦU *** để tránh lỗi ReferenceError khi dùng trong catch
        const msgId = (e.data && e.data.msgId) ? e.data.msgId : null;

        try {
            if (e.data.type === 'INIT') {
                // CHỈ NẠP XLSX (SheetJS) - ổn định trong blob Worker
                importScripts(e.data.basePath + '/xlsx.full.min.js');
                self.postMessage({ type: 'INIT_SUCCESS' });

            } else if (e.data.type === 'APPLY_PIPELINE') {
                const { steps, fullData } = e.data;
                let res = Array.isArray(fullData) ? [...fullData] : [];
                for (const s of steps) { if (!s.disabled) res = applyStepToData(res, s); }
                self.processedData = res;
                self.postMessage({ type: 'PIPELINE_SUCCESS', msgId, totalRows: res.length, previewData: res.slice(0, 1000) });

            } else if (e.data.type === 'EXPORT_FINAL') {
                // DÙNG XLSX (SheetJS) để tạo file - KHÔNG dùng ExcelJS vì không load được ổn định trong blob Worker
                if (!self.processedData || self.processedData.length === 0) throw new Error('Không có dữ liệu để xuất.');
                const headers = Object.keys(self.processedData[0]);
                const rows = [headers];
                for (let i = 0; i < self.processedData.length; i++) {
                    rows.push(headers.map(h => {
                        const v = self.processedData[i][h];
                        return (v === null || v === undefined) ? '' : v;
                    }));
                }
                const ws = XLSX.utils.aoa_to_sheet(rows);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Data');
                // XLSX.write type:'array' trả về plain Array, phải bọc trong Uint8Array mới có .buffer
                const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
                const buffer = new Uint8Array(arr).buffer;
                self.postMessage({ type: 'EXPORT_SUCCESS', msgId, buffer }, [buffer]);
            }
        } catch(err) {
            self.postMessage({ type: 'ERROR', msgId, error: err.toString() });
        }
    };
`;

class ExcelWorkerAPI {
    constructor() {
        this.callbacks = new Map();
        this.msgCounter = 0;
        this.basePath = location.href.substring(0, location.href.lastIndexOf('/'));
        try {
            const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
            this.worker = new Worker(URL.createObjectURL(blob));
            this.worker.onmessage = (e) => this.handleMessage(e.data);
            this.worker.onerror = (e) => console.error('Worker error:', e);
        } catch (e) {
            console.error("Worker init failed:", e);
        }
    }

    handleMessage(data) {
        if (data.type === 'ERROR') {
            alert("Lỗi: " + data.error);
            if (data.msgId && this.callbacks.has(data.msgId)) {
                this.callbacks.get(data.msgId).reject(new Error(data.error));
                this.callbacks.delete(data.msgId);
            }
        } else if (data.type === 'INIT_SUCCESS') {
            if (this.initResolve) this.initResolve();
        } else if (data.type === 'PIPELINE_SUCCESS') {
            const cb = this.callbacks.get(data.msgId);
            if (cb) { cb.resolve({ previewData: data.previewData, totalRows: data.totalRows }); this.callbacks.delete(data.msgId); }
        } else if (data.type === 'EXPORT_SUCCESS') {
            const cb = this.callbacks.get(data.msgId);
            if (cb) { cb.resolve(data.buffer); this.callbacks.delete(data.msgId); }
        }
    }

    async init() {
        return new Promise((res) => {
            this.initResolve = res;
            this.worker.postMessage({ type: 'INIT', basePath: this.basePath });
        });
    }

    async runPipeline(steps, fullData) {
        return new Promise((res, rej) => {
            const msgId = 'm' + (++this.msgCounter);
            this.callbacks.set(msgId, { resolve: res, reject: rej });
            // Làm sạch data trước khi gửi để tránh DataCloneError từ ExcelJS objects
            try {
                const safeData = (fullData || []).map(row => {
                    const nr = {};
                    for (const k in row) {
                        let v = row[k];
                        if (v && typeof v === 'object' && !(v instanceof Date)) {
                            if (v.result !== undefined) v = v.result;
                            else if (Array.isArray(v.richText)) v = v.richText.map(r => r.text || '').join('');
                            else if (v.text !== undefined) v = v.text;
                            else v = String(v);
                        }
                        nr[k] = v;
                    }
                    return nr;
                });
                const safeSteps = JSON.parse(JSON.stringify(steps));
                this.worker.postMessage({ type: 'APPLY_PIPELINE', msgId, steps: safeSteps, fullData: safeData });
            } catch (e) {
                rej(new Error("Lỗi chuẩn hóa dữ liệu: " + e.message));
            }
        });
    }

    async exportFinal() {
        return new Promise((res, rej) => {
            const msgId = 'm' + (++this.msgCounter);
            this.callbacks.set(msgId, { resolve: res, reject: rej });
            this.worker.postMessage({ type: 'EXPORT_FINAL', msgId });
        });
    }

    terminate() { if (this.worker) this.worker.terminate(); }
}

async function readExcelFile(file, limit = 2000) {
    const buffer = await file.arrayBuffer();
    let data = [];
    let headers = [];
    let sheetNames = [];
    let mainSheetName = "";

    try {
        // Dùng ExcelJS để đọc - tốt hơn cho font và cấu trúc file
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const worksheet = workbook.worksheets[0];
        if (worksheet) {
            mainSheetName = worksheet.name;
            sheetNames = workbook.worksheets.map(w => w.name);
            worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
                if (rowNumber === 1) {
                    headers = row.values.slice(1).map((h, i) => {
                        // Làm sạch tiêu đề cột (tránh hiển thị [object Object])
                        return String(_sanitizeCellVal(h) || '').trim() || 'Col' + (i + 1);
                    });
                } else {
                    const rowObj = {};
                    row.values.slice(1).forEach((val, i) => {
                        rowObj[headers[i]] = _sanitizeCellVal(val);
                    });
                    if (Object.values(rowObj).some(v => v !== '')) data.push(rowObj);
                }
            });
        }
    } catch (e) { console.warn("ExcelJS failed, falling back to XLSX:", e); }

    // Fallback sang XLSX (SheetJS) nếu ExcelJS thất bại
    if (data.length === 0) {
        const wb = XLSX.read(buffer, { type: 'array' });
        sheetNames = wb.SheetNames;
        mainSheetName = sheetNames[0];
        const ws = wb.Sheets[mainSheetName];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (raw.length > 0) {
            headers = raw[0].map((h, i) => String(h || '').trim() || 'Col' + (i + 1));
            for (let i = 1; i < raw.length; i++) {
                const rowObj = {};
                headers.forEach((h, idx) => { rowObj[h] = (raw[i][idx] === null || raw[i][idx] === undefined) ? '' : raw[i][idx]; });
                if (Object.values(rowObj).some(v => v !== '')) data.push(rowObj);
            }
        }
    }

    // Sửa font tiếng Việt
    let finalData = data;
    let detected = 'NONE';
    if (typeof VietEncoder !== 'undefined') {
        // BƯỚC 1: Detect từ DATA (ưu tiên cao nhất, ít false positive)
        detected = VietEncoder.detect(data.slice(0, 500));

        // BƯỚC 2: Nếu data không detect được, kiểm tra CRM_BUG từ headers
        // CHỈ check CRM_BUG (regex đặc thù) - KHÔNG dùng headerFakeRow cho TCVN3/VNI
        // vì TCVN3/VNI regex có thể match nhầm với Unicode tiếng Việt chuẩn (gây "Số"→"Sộ")
        if (detected === 'NONE') {
            const headerStr = headers.join(' ');
            const dataStr = JSON.stringify(data.slice(0, 100));
            const combined = headerStr + ' ' + dataStr;
            if (/NguyỦn|Thỹ|VĒn|TĒng|HỜng|Nguyỡt|TrĒm|NGìY|LỢc|TưỸng|QuỘc|HỒ TàN|SỘ|sỘ|Ęiỡn|ĘỢng|Đỹa|chỰ|Ę/.test(combined)) {
                detected = 'CRM_BUG';
            }
        }

        if (detected !== 'NONE') {
            // Sửa cả KEY (tên cột) lẫn VALUE
            finalData = data.map(row => {
                const newRow = {};
                for (const k in row) {
                    const fixedKey = VietEncoder.fix(k, detected);
                    newRow[fixedKey] = (typeof row[k] === 'string') ? VietEncoder.fix(row[k], detected) : row[k];
                }
                return newRow;
            });
            headers = headers.map(h => VietEncoder.fix(h, detected));
        }
    }

    const workerApi = new ExcelWorkerAPI();
    await workerApi.init();

    return {
        fileName: file.name,
        workerApi: workerApi,
        sheetNames: sheetNames,
        sheetsData: {
            [mainSheetName]: {
                headers,
                data: limit ? finalData.slice(0, limit) : finalData,
                fullData: finalData,
                totalRows: finalData.length,
                detectedEncoding: detected
            }
        }
    };
}
