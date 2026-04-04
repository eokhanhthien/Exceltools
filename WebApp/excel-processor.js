/* 
 * Lõi xử lý Excel thay thế cho VBA
 */

// Tiện ích để bỏ dấu tiếng Việt (thay thế cho hàm RemoveVietnameseTone trong VBA)
function removeVietnameseTones(str) {
    if (!str) return "";
    str = str.toString();
    return str.normalize('NFD') // Tách dấu ra khỏi ký tự
              .replace(/[\u0300-\u036f]/g, '') // Bỏ các dấu
              .replace(/đ/g, 'd').replace(/Đ/g, 'D'); // Chuyển đ/Đ
}

// Lấy file và trả về JS Workbook object
async function readWorkbook(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                resolve(workbook);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
}

// Trả về danh sách tên cột để hiển thị UI dropdown
function getHeaders(workbook) {
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    // header: 1 trả về mảng các mảng (mảng 2 chiều), hàng đầu tiên là hàng số 0
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (rawData.length === 0) return [];
    
    // Hàng số 0 chứa header
    const headers = rawData[0];
    return headers.map((col, index) => {
        return {
            index: index,
            name: col || `Cột trống ${index + 1}`,
            cleanedName: removeVietnameseTones(col || "").trim()
        };
    });
}

/**
 * Xử lý hàm ProcessFileWithDialog của VBA
 * Mặc định map các cột trong VBA như sau:
 * CIF: Cột 3 (index 2)
 * Số Dư: Cột 51 (index 50)
 * Tên KH: Cột 4 (index 3)
 * PGD: Cột 2 (index 1)
 */
async function processData(workbook, filters, updateProgress) {
    return new Promise((resolve) => {
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Đọc dữ liệu thô (bỏ qua hàng header trống)
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        
        if (rawData.length <= 1) {
            resolve([]);
            return;
        }

        const dictCIF = new Map(); // Dùng Map cho truy xuất siêu tốc O(1)
        
        // Cấu hình vị trí các cột theo code VBA gốc (0-indexed)
        const COL_CIF = 2;
        const COL_TEN_KH = 3;
        const COL_SO_DU = 50;
        const COL_PGD = 1;

        const totalRows = rawData.length - 1; // Bỏ qua dòng header
        let matchCount = 0;

        // Bắt đầu duyệt từng dòng (i = 1 để bỏ qua header row 0)
        for (let i = 1; i < rawData.length; i++) {
            const row = rawData[i];
            const cifStr = String(row[COL_CIF] || "").trim();

            if (cifStr !== "") {
                let passFilter = true;

                // Áp dụng bộ lọc đa điều kiện
                for (const filter of filters) {
                    const cellValue = String(row[filter.colIndex] || "").trim().toUpperCase();
                    const filterVal = filter.value.trim().toUpperCase();

                    if (filterVal !== "*") {
                        const arrVals = filterVal.split("+").map(v => v.trim());
                        let foundMatch = false;

                        for (const v of arrVals) {
                            if (cellValue.includes(v)) {
                                foundMatch = true;
                                break;
                            }
                        }

                        if (!foundMatch) {
                            passFilter = false;
                            break;
                        }
                    }
                }

                if (passFilter) {
                    matchCount++;

                    // Xử lý Số dư (cố gắng parse ra số, nếu lỗi thì về 0)
                    let soDu = parseFloat(row[COL_SO_DU]);
                    if (isNaN(soDu)) soDu = 0;

                    const tenKH = String(row[COL_TEN_KH] || "").trim();
                    const pgd = String(row[COL_PGD] || "").trim();

                    // Group by CIF logic
                    if (!dictCIF.has(cifStr)) {
                        dictCIF.set(cifStr, {
                            TenKH: tenKH,
                            SoDu: soDu,
                            PGD: [pgd].filter(Boolean) // mảng lưu các PGD unique
                        });
                    } else {
                        const existing = dictCIF.get(cifStr);
                        existing.SoDu += soDu;
                        if (pgd && !existing.PGD.includes(pgd)) {
                            existing.PGD.push(pgd);
                        }
                    }
                }
            }

            // Gọi update UI progress (không gọi với mỗi dòng vì quá tải UI)
            if (i % 5000 === 0 && updateProgress) {
                const percent = Math.floor((i / totalRows) * 100);
                updateProgress(percent);
            }
        }

        // Chuyển kết quả Map thành Array để xuất Excel
        const result = [];
        for (const [cif, info] of dictCIF.entries()) {
            result.push({
                "Tên Khách Hàng": info.TenKH,
                "CIF": cif,
                "Số Dư Tiền Gửi": info.SoDu,
                "Phòng Giao Dịch": info.PGD.join(", ")
            });
        }

        if (updateProgress) updateProgress(100);
        resolve(result);
    });
}

/**
 * Xử lý hàm SoSanhHaiSheet của VBA
 * So sánh 2 mảng kết quả đã được xử lý từ hàm processData
 * Output: Mảng data format để hiện thị lên bảng (Bao gồm top 30 tăng/giảm)
 */
async function compareData(workbookOld, workbookNew) {
    return new Promise((resolve) => {
        // Hàm phụ trợ đọc định dạng file KetQua
        function readKetQua(workbook) {
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(sheet, { defval: "" }); // Đọc dạng object dựa vào header
            const map = new Map();
            data.forEach(row => {
                const cif = String(row["CIF"] || "").trim();
                if (cif) {
                    let soDu = parseFloat(row["Số Dư Tiền Gửi"] || row["So Du Tien Gui"]);
                    if (isNaN(soDu)) soDu = 0;
                    map.set(cif, {
                        TenKH: String(row["Tên Khách Hàng"] || row["Ten Khach Hang"] || "").trim(),
                        PGD: String(row["Phòng Giao Dịch"] || row["Phong Giao Dich"] || "").trim(),
                        SoDu: soDu
                    });
                }
            });
            return map;
        }

        const dictOld = readKetQua(workbookOld);
        const dictNew = readKetQua(workbookNew);

        // Tập hợp tất cả khóa CIF
        const allCIFs = new Set([...dictOld.keys(), ...dictNew.keys()]);

        const arrSort = [];

        for (const cif of allCIFs) {
            const oldData = dictOld.get(cif) || { SoDu: 0, TenKH: "", PGD: "" };
            const newData = dictNew.get(cif) || { SoDu: 0, TenKH: "", PGD: "" };

            const listTen = newData.TenKH || oldData.TenKH;
            const listPGD = newData.PGD || oldData.PGD;
            
            const chenhLech = newData.SoDu - oldData.SoDu;

            if (chenhLech !== 0) {
                // percent changed fallback nếu base = 0
                const phanTram = oldData.SoDu !== 0 ? (chenhLech / oldData.SoDu) : null;
                
                arrSort.push({
                    cif: cif,
                    tenKH: listTen,
                    pgd: listPGD,
                    soDuOld: oldData.SoDu,
                    soDuNew: newData.SoDu,
                    chenhLech: chenhLech,
                    phanTram: phanTram
                });
            }
        }

        // Sắp xếp desc theo Chênh lệch (thay thế cho QuickSort trong VBA của bạn)
        arrSort.sort((a, b) => b.chenhLech - a.chenhLech);

        // Lọc Top 30 Tăng nhiều nhất (ở đầu mảng sinh ra những giá trị dương to nhất)
        const topTang = [];
        for (let i = 0; i < arrSort.length; i++) {
            if (arrSort[i].chenhLech > 0 && topTang.length < 30) {
                topTang.push({ ...arrSort[i], Loai: "Tăng" });
            }
        }

        // Lọc Top 30 Giảm nhiều nhất (ở cuối mảng các giá trị âm to nhất)
        const topGiam = [];
        for (let i = arrSort.length - 1; i >= 0; i--) {
            if (arrSort[i].chenhLech < 0 && topGiam.length < 30) {
                topGiam.push({ ...arrSort[i], Loai: "Giảm" });
            }
        }

        resolve({ arrayFull: arrSort, topTang, topGiam });
    });
}

// Tiện ích xuất file (dành riêng cho xuất Kết Quả)
function exportExcel(dataArray, defaultFileName) {
    const ws = XLSX.utils.json_to_sheet(dataArray);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "KetQua");
    XLSX.writeFile(wb, defaultFileName);
}

// Tiện ích xuất file So Sánh
function exportCompareExcel(topTang, topGiam, fileName) {
    const finalData = [];

    // Header tự tạo
    let rank = 1;
    for (const item of topTang) {
        finalData.push({
            "Phân Loại": item.Loai,
            "Hạng": rank++,
            "CIF": item.cif,
            "Tên Khách Hàng": item.tenKH,
            "Phòng Giao Dịch": item.pgd,
            "Số Dư Cũ": item.soDuOld,
            "Số Dư Mới": item.soDuNew,
            "Chênh Lệch": item.chenhLech,
            "% Thay Đổi": item.phanTram !== null ? (item.phanTram * 100).toFixed(2) + "%" : "N/A"
        });
    }

    rank = 1;
    for (const item of topGiam) {
        finalData.push({
            "Phân Loại": item.Loai,
            "Hạng": rank++,
            "CIF": item.cif,
            "Tên Khách Hàng": item.tenKH,
            "Phòng Giao Dịch": item.pgd,
            "Số Dư Cũ": item.soDuOld,
            "Số Dư Mới": item.soDuNew,
            "Chênh Lệch": item.chenhLech,
            "% Thay Đổi": item.phanTram !== null ? (item.phanTram * 100).toFixed(2) + "%" : "N/A"
        });
    }

    const ws = XLSX.utils.json_to_sheet(finalData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SoSanh");
    XLSX.writeFile(wb, fileName);
}
