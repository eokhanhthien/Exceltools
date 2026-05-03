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
        } else if (step.type === 'FORMULA_BUILDER') {
            const newCol = (config.newColName && config.newColName.trim()) ? config.newColName : 'Kết Quả';
            const formula = String(config.formula || '').trim();
            if (formula) {
                // Helper: parse date từ nhiều định dạng khác nhau
                // Helper: Parse chuỗi theo định dạng cụ thể (VD: dd/mm/yyyy)
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
                const _pad = n => String(n).padStart(2,'0');
                const _df = (v, fmt) => {
                    const d = _pd(v); if (!d) return '';
                    const _f = (fmt || 'dd/MM/yyyy').toLowerCase();
                    const _y = d.getFullYear(), _m = d.getMonth() + 1, _dy = d.getDate();
                    const _h = d.getHours(), _mi = d.getMinutes(), _s = d.getSeconds();
                    const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                    const MO = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
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
                // Bỏ dấu tiếng Việt
                const _noAccent = s => String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,c=>c==='đ'?'d':'D');

                const _XL = {
                    // === ĐIỀU KIỆN ===
                    IF: (c,t,f)=>c?t:f,
                    IFS: (...a)=>{ for(let i=0;i<a.length-1;i+=2){if(a[i])return a[i+1];} return a[a.length-1]; },
                    IFERROR: (v,e)=>(v===null||v===undefined||String(v).startsWith('#'))?e:v,
                    IFBLANK: (v,e)=>(v===null||v===undefined||v==='')?e:v,
                    SWITCH: (val,...a)=>{ for(let i=0;i<a.length-1;i+=2){if(val==a[i])return a[i+1];} return a[a.length-1]; },
                    // === CHUỖI ===
                    LEFT: (s,n)=>String(s??'').substring(0,n??1),
                    RIGHT: (s,n)=>{ const str=String(s??''); n=n??1; return str.substring(str.length-n); },
                    MID: (s,st,n)=>String(s??'').substring((st??1)-1,(st??1)-1+(n??1)),
                    LEN: (s)=>String(s??'').length,
                    TRIM: (s)=>String(s??'').trim(),
                    LTRIM: (s)=>String(s??'').trimStart(),
                    RTRIM: (s)=>String(s??'').trimEnd(),
                    UPPER: (s)=>String(s??'').toUpperCase(),
                    LOWER: (s)=>String(s??'').toLowerCase(),
                    PROPER: (s)=>String(s??'').replace(/\b\w/g,c=>c.toUpperCase()).replace(/\B\w/g,c=>c.toLowerCase()),
                    CONCATENATE: (...a)=>a.map(x=>x??'').join(''),
                    CONCAT: (...a)=>a.map(x=>x??'').join(''),
                    TEXTJOIN: (sep,ig,...a)=>a.flat().filter(x=>!ig||(x!==null&&x!==undefined&&x!=='')).join(sep),
                    SUBSTITUTE: (s,od,nw,n)=>{ s=String(s??''); od=String(od); nw=String(nw); if(n!=null){let c=0;return s.replace(new RegExp(od.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),m=>++c===n?nw:m);} return s.split(od).join(nw); },
                    REPLACE: (s,st,n,nw)=>String(s??'').substring(0,(st??1)-1)+String(nw??'')+String(s??'').substring((st??1)-1+(n??0)),
                    FIND: (f,w,st)=>{ const i=String(w??'').indexOf(String(f),(st??1)-1); return i===-1?'#N/A':i+1; },
                    SEARCH: (f,w,st)=>{ const i=String(w??'').toLowerCase().indexOf(String(f??'').toLowerCase(),(st??1)-1); return i===-1?'#N/A':i+1; },
                    EXACT: (a,b)=>String(a)===String(b),
                    REPT: (s,n)=>String(s??'').repeat(Math.max(0,n??0)),
                    CHAR: n=>String.fromCharCode(n),
                    CODE: s=>String(s??'').charCodeAt(0),
                    CLEAN: s=>String(s??'').replace(/[\x00-\x1F]/g,''),
                    PADLEFT: (s,n,c)=>String(s??'').padStart(n??0, c??'0'),
                    PADRIGHT: (s,n,c)=>String(s??'').padEnd(n??0, c??' '),
                    SPLIT: (s,sep,i)=>{ const arr=String(s??'').split(sep??','); return i!=null ? (arr[i-1]??'') : arr; },
                    REMOVEACCENTS: s=>_noAccent(s),
                    REMOVEVN: s=>_noAccent(s),
                    EXTRACTNUM: s=>{ const m=String(s??'').match(/[\d.,]+/g); return m?parseFloat(m.join('').replace(/,/g,'')):0; },
                    EXTRACTTEXT: s=>String(s??'').replace(/[0-9.,\-+]/g,'').trim(),
                    CONTAINS: (s,sub)=>String(s??'').includes(String(sub??'')),
                    STARTSWITH: (s,pre)=>String(s??'').startsWith(String(pre??'')),
                    ENDSWITH: (s,suf)=>String(s??'').endsWith(String(suf??'')),
                    REPEAT: (s,n)=>String(s??'').repeat(Math.max(0,n??0)),
                    NUMBERVALUE: s=>parseFloat(String(s??'').replace(/[^0-9.,-]/g,'').replace(/,/g,''))||0,
                    VALUE: s=>{ const n=parseFloat(String(s??'').replace(/,/g,'')); return isNaN(n)?0:n; },
                    // === SỐ HỌC ===
                    INT: n=>Math.floor(parseFloat(n)||0),
                    ROUND: (n,d)=>{ d=d??0; return parseFloat((parseFloat(n)||0).toFixed(d)); },
                    ROUNDUP: (n,d)=>{ d=d??0; const f=Math.pow(10,d); return Math.ceil((parseFloat(n)||0)*f)/f; },
                    ROUNDDOWN: (n,d)=>{ d=d??0; const f=Math.pow(10,d); return Math.floor((parseFloat(n)||0)*f)/f; },
                    ABS: n=>Math.abs(parseFloat(n)||0),
                    MOD: (n,d)=>(parseFloat(n)||0)%(parseFloat(d)||1),
                    POWER: (n,p)=>Math.pow(parseFloat(n)||0,parseFloat(p)||1),
                    SQRT: n=>Math.sqrt(parseFloat(n)||0),
                    LOG: (n,b)=>b?Math.log(parseFloat(n))/Math.log(parseFloat(b)):Math.log10(parseFloat(n)),
                    LN: n=>Math.log(parseFloat(n)||0),
                    EXP: n=>Math.exp(parseFloat(n)||0),
                    CEILING: (n,s)=>{ s=s||1; return Math.ceil((parseFloat(n)||0)/s)*s; },
                    FLOOR: (n,s)=>{ s=s||1; return Math.floor((parseFloat(n)||0)/s)*s; },
                    TRUNC: (n,d)=>{ d=d??0; const f=Math.pow(10,d); return Math.trunc((parseFloat(n)||0)*f)/f; },
                    SIGN: n=>Math.sign(parseFloat(n)||0),
                    RAND: ()=>Math.random(),
                    RANDBETWEEN: (lo,hi)=>Math.floor(Math.random()*((hi||1)-(lo||0)+1))+(lo||0),
                    // === ĐỊNH DẠNG SỐ ===
                    TEXT: (v,fmt)=>{ if(!fmt)return String(v??''); const n=parseFloat(v); if(!isNaN(n)){if(fmt.includes('%'))return(n*100).toFixed(fmt.match(/\.(\d+)%/)?.[1]||0)+'%'; const dm=fmt.match(/0\.(0+)/); if(dm)return n.toFixed(dm[1].length); if(fmt==='#,##0'||fmt==='#,###')return n.toLocaleString('vi-VN');} return String(v??''); },
                    FIXED: (n,d,nc)=>{ n=parseFloat(n)||0; d=d??2; return nc?n.toFixed(d):n.toLocaleString('vi-VN',{minimumFractionDigits:d,maximumFractionDigits:d}); },
                    VND: n=>{ n=parseFloat(n)||0; return n.toLocaleString('vi-VN',{style:'currency',currency:'VND'}); },
                    DOLLAR: (n,d)=>{ n=parseFloat(n)||0; d=d??2; return '$'+n.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}); },
                    PERCENT: (n,d)=>{ n=parseFloat(n)||0; d=d??1; return (n*100).toFixed(d)+'%'; },
                    NUMFORMAT: (n,fmt)=>{ n=parseFloat(n)||0; if(fmt==='VND')return n.toLocaleString('vi-VN',{style:'currency',currency:'VND'}); if(fmt==='USD')return n.toLocaleString('en-US',{style:'currency',currency:'USD'}); const dm=fmt?.match(/0\.(0+)/); if(dm)return n.toFixed(dm[1].length); return n.toLocaleString('vi-VN'); },
                    // === NGÀY THÁNG ===
                    TODAY: ()=>{ const d=new Date(); return `${_pad(d.getDate())}/${_pad(d.getMonth()+1)}/${d.getFullYear()}`; },
                    NOW: ()=>{ const d=new Date(); return `${_pad(d.getDate())}/${_pad(d.getMonth()+1)}/${d.getFullYear()} ${_pad(d.getHours())}:${_pad(d.getMinutes())}`; },
                    DAY: v=>{ const d=_pd(v); return d?d.getDate():0; },
                    MONTH: v=>{ const d=_pd(v); return d?d.getMonth()+1:0; },
                    YEAR: v=>{ const d=_pd(v); return d?d.getFullYear():0; },
                    HOUR: v=>{ const d=_pd(v); return d?d.getHours():0; },
                    MINUTE: v=>{ const d=_pd(v); return d?d.getMinutes():0; },
                    SECOND: v=>{ const d=_pd(v); return d?d.getSeconds():0; },
                    WEEKDAY: (v,m)=>{ const d=_pd(v); if(!d)return 0; const w=d.getDay(); return m===2?w===0?7:w:w+1; }, // m=2: 1=Mon..7=Sun
                    WEEKNUM: v=>{ const d=_pd(v); if(!d)return 0; const s=new Date(d.getFullYear(),0,1); return Math.ceil(((d-s)/86400000+s.getDay()+1)/7); },
                    DATEFORMAT: (v,fmt)=>_df(v,fmt),
                    DATEPARSE: (s,fmt)=>_parseFmt(s,fmt),
                    DATECONVERT: (s,srcFmt,destFmt)=>_df(_parseFmt(s,srcFmt), destFmt),
                    DATEVALUE: s=>{ const d=_pd(s); return d?`${_pad(d.getDate())}/${_pad(d.getMonth()+1)}/${d.getFullYear()}`:''; },
                    DATE: (y,m,d)=>{ const dt=new Date(y,m-1,d); return `${_pad(dt.getDate())}/${_pad(dt.getMonth()+1)}/${dt.getFullYear()}`; },
                    DAYS: (e,s)=>{ const de=_pd(e),ds=_pd(s); return (de&&ds)?Math.round((de-ds)/86400000):0; },
                    DATEDIF: (s,e,u)=>{ const ds=_pd(s),de=_pd(e); if(!ds||!de)return 0; u=String(u).toUpperCase(); if(u==='D')return Math.round((de-ds)/86400000); if(u==='M')return (de.getFullYear()-ds.getFullYear())*12+(de.getMonth()-ds.getMonth()); if(u==='Y')return de.getFullYear()-ds.getFullYear(); return 0; },
                    EDATE: (v,m)=>{ const d=_pd(v); if(!d)return ''; const r=new Date(d); r.setMonth(r.getMonth()+(m||0)); return `${_pad(r.getDate())}/${_pad(r.getMonth()+1)}/${r.getFullYear()}`; },
                    EOMONTH: (v,m)=>{ const d=_pd(v); if(!d)return ''; const r=new Date(d.getFullYear(),d.getMonth()+(m||0)+1,0); return `${_pad(r.getDate())}/${_pad(r.getMonth()+1)}/${r.getFullYear()}`; },
                    ADDDAYS: (v,n)=>{ const d=_pd(v); if(!d)return ''; const r=new Date(d.getTime()+(n||0)*86400000); return `${_pad(r.getDate())}/${_pad(r.getMonth()+1)}/${r.getFullYear()}`; },
                    ADDMONTHS: (v,n)=>{ const d=_pd(v); if(!d)return ''; const r=new Date(d); r.setMonth(r.getMonth()+(n||0)); return `${_pad(r.getDate())}/${_pad(r.getMonth()+1)}/${r.getFullYear()}`; },
                    ADDYEARS: (v,n)=>{ const d=_pd(v); if(!d)return ''; const r=new Date(d); r.setFullYear(r.getFullYear()+(n||0)); return `${_pad(r.getDate())}/${_pad(r.getMonth()+1)}/${r.getFullYear()}`; },
                    QUARTEROF: v=>{ const d=_pd(v); return d?Math.ceil((d.getMonth()+1)/3):0; },
                    ISWEEKEND: v=>{ const d=_pd(v); return d?d.getDay()===0||d.getDay()===6:false; },
                    ISWORKDAY: v=>{ const d=_pd(v); return d?d.getDay()!==0&&d.getDay()!==6:false; },
                    // === THỐNG KÊ ===
                    SUM: (...a)=>a.flat().reduce((s,x)=>s+(parseFloat(x)||0),0),
                    AVERAGE: (...a)=>{ const arr=a.flat().map(x=>parseFloat(x)).filter(x=>!isNaN(x)); return arr.length?arr.reduce((s,x)=>s+x,0)/arr.length:0; },
                    MAX: (...a)=>Math.max(...a.flat().map(x=>parseFloat(x)||0)),
                    MIN: (...a)=>Math.min(...a.flat().map(x=>parseFloat(x)||0)),
                    COUNT: (...a)=>a.flat().filter(x=>!isNaN(parseFloat(x))).length,
                    COUNTA: (...a)=>a.flat().filter(x=>x!==null&&x!==undefined&&x!=='').length,
                    // === LOGIC & KIỂM TRA ===
                    AND: (...a)=>a.flat().every(Boolean),
                    OR: (...a)=>a.flat().some(Boolean),
                    NOT: v=>!v,
                    XOR: (...a)=>a.flat().filter(Boolean).length%2!==0,
                    ISBLANK: v=>v===null||v===undefined||v==='',
                    ISNUMBER: v=>!isNaN(parseFloat(v))&&v!==''&&v!==null,
                    ISTEXT: v=>typeof v==='string'&&isNaN(parseFloat(v)),
                    ISERROR: v=>v===null||String(v).startsWith('#'),
                    ISDATE: v=>_pd(v)!==null,
                    TRUE: true, FALSE: false,
                };
                result = result.map(row => {
                    const newRow = { ...row };
                    try {
                        // Chuẩn hóa công thức: chuyển = thành == (nếu không nằm trong chuỗi)
                        // Lưu ý: Chỉ thay thế các dấu = đơn lẻ không đi kèm > hoặc <
                        let processedFormula = formula.replace(/([^<>!])=([^=])/g, '$1==$2');
                        
                        const expr = processedFormula.replace(/\[([^\]]+)\]/g, (_, col) => {
                            // Tìm cột không phân biệt hoa thường và khoảng trắng
                            const realKey = Object.keys(row).find(k => k.trim().toLowerCase() === col.trim().toLowerCase()) || col;
                            let v = row[realKey];
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
                        const _XL_WITH_ALIASES = { ..._XL, COT: "", C1: "", C2: "", DK: false };
                        newRow[newCol] = new Function('_XL', `with(_XL){return ${expr};}`)(_XL_WITH_ALIASES);
                    } catch(e) { newRow[newCol] = '#LỖI: ' + e.message; }
                    return newRow;
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

// Expose ra global để app-studio.js có thể gọi được
if (typeof window !== 'undefined') {
    window.readExcelFile = readExcelFile;
    window.ExcelWorkerAPI = ExcelWorkerAPI;
}
