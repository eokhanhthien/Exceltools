/**
 * viet-encoder.js - PHIÊN BẢN NUCLEAR (v6 - Final CRM Bug Fix)
 * Sửa triệt để lỗi TCVN3/VNI và lỗi đặc thù xuất file từ CRM/Core Banking (T24).
 */

const VietEncoder = (function() {
    /**
     * CRM_BUG_MAP - Bảng sửa lỗi T24/Core Banking (Temenos)
     * Thứ tự: Pattern dài/cụ thể TRƯỚC, ký tự đơn SAU để tránh xung đột.
     *
     * Quy tắc T24: Hệ thống xuất file dùng sai ký tự Unicode cho một số âm tiết.
     * Bảng này được xây dựng từ phân tích thực tế các file xuất T24.
     */
    const CRM_BUG_MAP = [
        // =========================================================
        // NHÓM 1: Các từ đặc thù T24 - khớp TOÀN TỪ (ưu tiên cao)
        // =========================================================
        // Họ tên phổ biến
        {f: 'NguyỦn', t: 'Nguyễn'}, {f: 'nguyỦn', t: 'nguyễn'},
        {f: 'Nguyỡt', t: 'Nguyệt'}, {f: 'nguyỡt', t: 'nguyệt'},
        {f: 'HỜng',   t: 'Hồng'},   {f: 'hỜng',   t: 'hồng'},
        {f: 'VĒn',    t: 'Văn'},    {f: 'vĒn',    t: 'văn'},
        {f: 'TĒng',   t: 'Tăng'},   {f: 'tĒng',   t: 'tăng'},
        {f: 'TrĒm',   t: 'Trâm'},
        {f: 'Thỹ',    t: 'Thị'},    {f: 'thỹ',    t: 'thị'},
        {f: 'LỢc',    t: 'Lộc'},
        {f: 'TưỸng',  t: 'Tưởng'},
        {f: 'QuỘc',   t: 'Quốc'},
        {f: 'Truyỡn', t: 'Truyền'}, {f: 'truyỡn', t: 'truyền'},
        {f: 'HỒ TàN', t: 'HỌ TÊN'}, {f: 'Hồ Tàn', t: 'Họ Tên'}, {f: 'hồ tàn', t: 'họ tên'},

        // Từ ngân hàng / tiêu đề cột phổ biến
        {f: 'NGìY',   t: 'NGÀY'},   {f: 'Ngìy', t: 'Ngày'}, {f: 'ngìy', t: 'ngày'},
        {f: 'ĐỔ ',    t: 'Đỗ '},
        {f: 'HỜ ',    t: 'Hồ '},
        {f: 'Ngơ ',   t: 'Ngô '},   {f: 'ngơ ', t: 'ngô '},
        {f: 'Tơn ',   t: 'Tôn '},   {f: 'tơn ', t: 'tôn '},
        {f: 'Tơn',    t: 'Tôn'},    {f: 'tơn',  t: 'tôn'},

        // =========================================================
        // NHÓM 2: Ę → Đ/đ (Latin E ogonek thay cho chữ Đ Việt Nam)
        // =========================================================
        // Phải đặt TRƯỚC các pattern chứa Ę để xử lý đúng
        {f: 'Ę', t: 'Đ'}, {f: 'ę', t: 'đ'},

        // =========================================================
        // NHÓM 3: Các chuỗi ký tự 2-3 chars (context-sensitive)
        // =========================================================
        // ỹa → ịa: "Đỹa" → "Địa", "ỹa chỰ" → "ịa chỉ"
        {f: 'ỸA', t: 'ỊA'}, {f: 'Ỹa', t: 'Ịa'}, {f: 'ỹa', t: 'ịa'},

        // ỡN / ỡn → ệN / ện: "Ęiỡn" → "Điện", "Truyỡn" đã xử lý ở trên
        {f: 'ỠN', t: 'ỆN'}, {f: 'Ỡn', t: 'Ện'}, {f: 'ỡn', t: 'ện'},

        // SỘ / sỘ → Số / số (chữ "số" - number)
        {f: 'SỘ', t: 'Số'}, {f: 'sỘ', t: 'số'},

        // Ợng / ỢNG → ộng / ỘNG: "Động", "cộng"
        {f: 'ỢNG', t: 'ỘNG'}, {f: 'Ợng', t: 'ộng'}, {f: 'ợng', t: 'ộng'},

        // =========================================================
        // NHÓM 4: Ký tự đơn - CAPITAL T24 bug chars
        // (chỉ xuất hiện như lỗi T24, không phải Unicode tiếng Việt chuẩn)
        // =========================================================
        // Ự (capital U+1EF0) → ỉ: "chỰ" → "chỉ"
        // LƯU Ý: KHÔNG map lowercase ự vì "tự", "thực" dùng ự hợp lệ
        {f: 'Ự', t: 'ỉ'},

        // Ợ đơn lẻ (capital) → ộ: "cán bỢ" → "cán bộ"
        // Đặt SAU ỢNG/Ợng để tránh double-convert
        {f: 'Ợ', t: 'ộ'},

        // Ủ → ễ: "NguyỦn" đã xử lý, nhưng cần thêm Ủ standalone
        // (comment: Ủ trong tiếng Việt là hợp lệ - cẩn thận khi thêm standalone)

        // =========================================================
        // NHÓM 5: Bổ sung từ ngân hàng hay gặp
        // =========================================================
        {f: 'phân khúc',    t: 'phân khúc'},   // giữ nguyên nếu đúng
        {f: 'kinh tỡ',      t: 'kinh tế'},
        {f: 'thành phỉn',   t: 'thành phần'},
        {f: 'tài khoỉn',    t: 'tài khoản'},
        {f: 'Tài khoỉn',    t: 'Tài khoản'},
        {f: 'TĂNG',         t: 'TĂNG'},         // bảo vệ, giữ nguyên
        {f: 'đỊnh',         t: 'định'},
        {f: 'loỊi',         t: 'loại'},
        {f: 'LoỊi',         t: 'Loại'},
        {f: 'xỡp',          t: 'xếp'},
        {f: 'Xỡp',          t: 'Xếp'},
        {f: 'hỊng',         t: 'hạng'},
        {f: 'HỊng',         t: 'Hạng'},
        {f: 'thỉnh',        t: 'thành'},
        {f: 'Thỉnh',        t: 'Thành'},
        {f: 'giao dỊch',    t: 'giao dịch'},
        {f: 'Giao dỊch',    t: 'Giao dịch'},
        {f: 'phòng giao',   t: 'phòng giao'},
        {f: 'chi nhánh',    t: 'chi nhánh'},
    ];

    const TCVN3_MAP = [
        {f: 'Aµ', t: 'À'}, {f: 'A¸', t: 'Á'}, {f: 'A·', t: 'Ã'}, {f: 'EÌ', t: 'È'}, {f: 'EÐ', t: 'É'},
        {f: 'I×', t: 'Ì'}, {f: 'IÝ', t: 'Í'}, {f: 'Oß', t: 'Ò'}, {f: 'Oã', t: 'Ó'}, {f: 'Oâ', t: 'Õ'},
        {f: 'Uï', t: 'Ù'}, {f: 'Uó', t: 'Ú'}, {f: 'Yý', t: 'Ý'}, {f: 'IÜ', t: 'Ĩ'}, {f: 'Uò', t: 'Ũ'},
        {f: 'A¹', t: 'Ạ'}, {f: 'A¶', t: 'Ả'}, {f: '¢Ê', t: 'Ấ'}, {f: '¢Ç', t: 'Ầ'}, {f: '¢È', t: 'Ẩ'},
        {f: '¢É', t: 'Ẫ'}, {f: '¢Ë', t: 'Ậ'}, {f: '¡¾', t: 'Ắ'}, {f: '¡»', t: 'Ằ'}, {f: '¡¼', t: 'Ẳ'},
        {f: '¡½', t: 'Ẵ'}, {f: '¡Æ', t: 'Ặ'}, {f: 'EÑ', t: 'Ẹ'}, {f: 'EÎ', t: 'Ẻ'}, {f: 'EÏ', t: 'Ẽ'},
        {f: '£Õ', t: 'Ế'}, {f: '£Ò', t: 'Ề'}, {f: '£Ó', t: 'Ể'}, {f: '£Ô', t: 'Ễ'}, {f: '£Ö', t: 'Ệ'},
        {f: 'IØ', t: 'Ỉ'}, {f: 'IÞ', t: 'Ị'}, {f: 'Oä', t: 'Ọ'}, {f: 'Oá', t: 'Ỏ'}, {f: '¤è', t: 'Ố'},
        {f: '¤å', t: 'Ồ'}, {f: '¤æ', t: 'Ổ'}, {f: '¤ç', t: 'Ỗ'}, {f: '¤é', t: 'Ộ'}, {f: '¥í', t: 'Ớ'},
        {f: '¥ê', t: 'Ờ'}, {f: '¥ë', t: 'Ở'}, {f: '¥ì', t: 'Ỡ'}, {f: '¥î', t: 'Ợ'}, {f: 'Uô', t: 'Ụ'},
        {f: 'Uñ', t: 'Ủ'}, {f: '¦ø', t: 'Ứ'}, {f: '¦õ', t: 'Ừ'}, {f: '¦ö', t: 'Ử'}, {f: '¦÷', t: 'Ữ'},
        {f: '¦ù', t: 'Ự'}, {f: 'Yú', t: 'Ỳ'}, {f: 'Yþ', t: 'Ỵ'}, {f: 'Yû', t: 'Ỷ'}, {f: 'Yü', t: 'Ỹ'},
        {f: '¢', t: 'Â'}, {f: '£', t: 'Ê'}, {f: '¤', t: 'Ô'}, {f: 'µ', t: 'à'}, {f: '¸', t: 'á'},
        {f: '©', t: 'â'}, {f: '·', t: 'ã'}, {f: 'Ì', t: 'è'}, {f: 'Ð', t: 'é'}, {f: 'ª', t: 'ê'},
        {f: '×', t: 'ì'}, {f: 'Ý', t: 'í'}, {f: 'ß', t: 'ò'}, {f: 'ã', t: 'ó'}, {f: '«', t: 'ô'},
        {f: 'â', t: 'õ'}, {f: 'ï', t: 'ù'}, {f: 'ó', t: 'ú'}, {f: 'ý', t: 'ý'}, {f: '¡', t: 'Ă'},
        {f: '§', t: 'Đ'}, {f: '¥', t: 'Ơ'}, {f: '¦', t: 'Ư'}, {f: '¨', t: 'ă'}, {f: '®', t: 'đ'},
        {f: 'Ü', t: 'ĩ'}, {f: 'ò', t: 'ũ'}, {f: '¬', t: 'ơ'}, {f: '­', t: 'ư'}, {f: '¹', t: 'ạ'},
        {f: '¶', t: 'ả'}, {f: 'Ê', t: 'ấ'}, {f: 'Ç', t: 'ầ'}, {f: 'È', t: 'ẩ'}, {f: 'É', t: 'ẫ'},
        {f: 'Ë', t: 'ậ'}, {f: '¾', t: 'ắ'}, {f: '»', t: 'ằ'}, {f: '¼', t: 'ẳ'}, {f: '½', t: 'ẵ'},
        {f: 'Æ', t: 'ặ'}, {f: 'Ñ', t: 'ẹ'}, {f: 'Î', t: 'ẻ'}, {f: 'Ï', t: 'ẽ'}, {f: 'Õ', t: 'ế'},
        {f: 'Ò', t: 'ề'}, {f: 'Ó', t: 'ể'}, {f: 'Ô', t: 'ễ'}, {f: 'Ö', t: 'ệ'}, {f: 'Ø', t: 'ỉ'},
        {f: 'Þ', t: 'ị'}, {f: 'ä', t: 'ọ'}, {f: 'á', t: 'ỏ'}, {f: 'è', t: 'ố'}, {f: 'å', t: 'ồ'},
        {f: 'æ', t: 'ổ'}, {f: 'ç', t: 'ỗ'}, {f: 'é', t: 'ộ'}, {f: 'í', t: 'ớ'}, {f: 'ê', t: 'ờ'},
        {f: 'ë', t: 'ở'}, {f: 'ì', t: 'ỡ'}, {f: 'î', t: 'ợ'}, {f: 'ô', t: 'ụ'}, {f: 'ñ', t: 'ủ'},
        {f: 'ø', t: 'ứ'}, {f: 'õ', t: 'ừ'}, {f: 'ö', t: 'ử'}, {f: '÷', t: 'ữ'}, {f: 'ù', t: 'ự'},
        {f: 'ú', t: 'ỳ'}, {f: 'þ', t: 'ỵ'}, {f: 'û', t: 'ỷ'}, {f: 'ü', t: 'ỹ'}
    ];

    const VNI_MAP = [
        {f: 'AØ', t: 'À'}, {f: 'AÙ', t: 'Á'}, {f: 'AÕ', t: 'Ã'}, {f: 'EØ', t: 'È'}, {f: 'EÙ', t: 'É'},
        {f: 'OØ', t: 'Ò'}, {f: 'OÙ', t: 'Ó'}, {f: 'OÕ', t: 'Õ'}, {f: 'UØ', t: 'Ù'}, {f: 'UÙ', t: 'Ú'},
        {f: 'YÙ', t: 'Ý'}, {f: 'UÕ', t: 'Ũ'}, {f: 'AÏ', t: 'Ạ'}, {f: 'AÛ', t: 'Ả'}, {f: 'AÁ', t: 'Ấ'},
        {f: 'AÀ', t: 'Ầ'}, {f: 'AÅ', t: 'Ẩ'}, {f: 'AÃ', t: 'Ẫ'}, {f: 'AÄ', t: 'Ậ'}, {f: 'AÉ', t: 'Ắ'},
        {f: 'AÈ', t: 'Ằ'}, {f: 'AÚ', t: 'Ẳ'}, {f: 'AÜ', t: 'Ẵ'}, {f: 'AË', t: 'Ặ'}, {f: 'EÏ', t: 'Ẹ'},
        {f: 'EÛ', t: 'Ẻ'}, {f: 'EÕ', t: 'Ẽ'}, {f: 'EÁ', t: 'Ế'}, {f: 'EÀ', t: 'Ề'}, {f: 'EÅ', t: 'Ể'},
        {f: 'EÃ', t: 'Ễ'}, {f: 'EÄ', t: 'Ệ'}, {f: 'OÏ', t: 'Ọ'}, {f: 'OÛ', t: 'Ỏ'}, {f: 'OÁ', t: 'Ố'},
        {f: 'OÀ', t: 'Ồ'}, {f: 'OÅ', t: 'Ổ'}, {f: 'OÃ', t: 'Ỗ'}, {f: 'OÄ', t: 'Ộ'}, {f: 'ÔÙ', t: 'Ớ'},
        {f: 'ÔØ', t: 'Ờ'}, {f: 'ÔÛ', t: 'Ở'}, {f: 'ÔÕ', t: 'Ỡ'}, {f: 'ÔÏ', t: 'Ợ'}, {f: 'UÏ', t: 'Ụ'},
        {f: 'UÛ', t: 'Ủ'}, {f: 'ÖÙ', t: 'Ứ'}, {f: 'ÖØ', t: 'Ừ'}, {f: 'ÖÛ', t: 'Ử'}, {f: 'ÖÕ', t: 'Ữ'},
        {f: 'ÖÏ', t: 'Ự'}, {f: 'YØ', t: 'Ỳ'}, {f: 'AÂ', t: 'Â'}, {f: 'EÂ', t: 'Ê'}, {f: 'OÂ', t: 'Ô'},
        {f: 'aø', t: 'à'}, {f: 'aù', t: 'á'}, {f: 'aâ', t: 'â'}, {f: 'aõ', t: 'ã'}, {f: 'eø', t: 'è'},
        {f: 'eù', t: 'é'}, {f: 'eâ', t: 'ê'}, {f: 'oø', t: 'ò'}, {f: 'où', t: 'ó'}, {f: 'oâ', t: 'ô'},
        {f: 'oõ', t: 'õ'}, {f: 'uø', t: 'ù'}, {f: 'uù', t: 'ú'}, {f: 'yù', t: 'ý'}, {f: 'AÊ', t: 'Ă'},
        {f: 'aê', t: 'ă'}, {f: 'uõ', t: 'ũ'}, {f: 'aï', t: 'ạ'}, {f: 'aû', t: 'ả'}, {f: 'aá', t: 'ấ'},
        {f: 'aà', t: 'ầ'}, {f: 'aå', t: 'ẩ'}, {f: 'aã', t: 'ẫ'}, {f: 'aä', t: 'ậ'}, {f: 'aé', t: 'ắ'},
        {f: 'aè', t: 'ằ'}, {f: 'aú', t: 'ẳ'}, {f: 'aü', t: 'ẵ'}, {f: 'aë', t: 'ặ'}, {f: 'eï', t: 'ẹ'},
        {f: 'eû', t: 'ẻ'}, {f: 'eõ', t: 'ẽ'}, {f: 'eá', t: 'ế'}, {f: 'eà', t: 'ề'}, {f: 'eå', t: 'ể'},
        {f: 'eã', t: 'ễ'}, {f: 'eä', t: 'ệ'}, {f: 'oï', t: 'ọ'}, {f: 'oû', t: 'ỏ'}, {f: 'oá', t: 'ố'},
        {f: 'oà', t: 'ồ'}, {f: 'oå', t: 'ổ'}, {f: 'oã', t: 'ỗ'}, {f: 'oä', t: 'ộ'}, {f: 'ôù', t: 'ớ'},
        {f: 'ôø', t: 'ờ'}, {f: 'ôû', t: 'ở'}, {f: 'ôõ', t: 'ỡ'}, {f: 'ôï', t: 'ợ'}, {f: 'uï', t: 'ụ'},
        {f: 'uû', t: 'ủ'}, {f: 'öù', t: 'ứ'}, {f: 'öø', t: 'ừ'}, {f: 'öû', t: 'ử'}, {f: 'öõ', t: 'ữ'},
        {f: 'öï', t: 'ự'}, {f: 'yø', t: 'ỳ'}, {f: 'Ó', t: 'Ĩ'}, {f: 'Æ', t: 'Ỉ'}, {f: 'Ò', t: 'Ị'},
        {f: 'Î', t: 'Ỵ'}, {f: 'Ë', t: 'Ỷ'}, {f: 'Ì', t: 'Ỹ'}, {f: 'ì', t: 'ì'}, {f: 'í', t: 'í'},
        {f: 'Ñ', t: 'Đ'}, {f: 'Ô', t: 'Ơ'}, {f: 'Ö', t: 'Ư'}, {f: 'ñ', t: 'đ'}, {f: 'ó', t: 'ĩ'},
        {f: 'ô', t: 'ơ'}, {f: 'ö', t: 'ư'}, {f: 'æ', t: 'ỉ'}, {f: 'ò', t: 'ị'}, {f: 'î', t: 'ỵ'},
        {f: 'ë', t: 'ỷ'}
    ];

    function convert(str, map) {
        if (!str || typeof str !== 'string') return str;
        let res = str;
        for (let i = 0; i < map.length; i++) {
            res = res.split(map[i].f).join(map[i].t);
        }
        return res;
    }

    let CUSTOM_BUG_MAP = [];

    return {
        setCustomMap: (mapArr) => {
            if (Array.isArray(mapArr)) CUSTOM_BUG_MAP = mapArr;
        },
        fix: (str, type) => {
            if (!str) return str;
            if (type === 'CRM_BUG') {
                let fixed = str;
                if (CUSTOM_BUG_MAP.length > 0) fixed = convert(fixed, CUSTOM_BUG_MAP);
                return convert(fixed, CRM_BUG_MAP);
            }
            if (type === 'TCVN3') return convert(str, TCVN3_MAP);
            if (type === 'VNI') return convert(str, VNI_MAP);
            return str;
        },
        detect: (data) => {
            if (!Array.isArray(data) || data.length === 0) return 'NONE';
            let combinedText = "";
            for (let i = 0; i < Math.min(data.length, 500); i++) {
                for (let key in data[i]) combinedText += " " + String(data[i][key] || "");
            }
            
            const crmBugRegex = /Thỹ|NguyỦn|VĒn|Nguyỡt|HỜng|Tơn|TĒng|HỒ TàN|NGìY|LỢc|TưỸng|ĐỔ|Truyỡn|QuỘc|TrĒm|SỘ|sỘ|Ęiỡn|ĘỢng|Đỹa|chỰ|Ę/i;
            if (crmBugRegex.test(combinedText)) return 'CRM_BUG';
            
            // Quét xem có dính từ trong Custom Dictionary không
            if (CUSTOM_BUG_MAP.length > 0) {
                const customMatches = CUSTOM_BUG_MAP.some(item => combinedText.includes(item.f));
                if (customMatches) return 'CRM_BUG';
            }
            
            const tcvn3Regex = /[µ¸¶·¹¬ª«®©¢¡¤£¥]/;
            const vniRegex = /[ñõöÑÕÖ]|a[ùøûüõ]|e[ùøûüõ]|o[ùøûüõ]|u[ùøûüõ]|i[ùøûüõ]|y[ùøûüõ]/i;
            
            let isTCVN3 = tcvn3Regex.test(combinedText);
            let isVNI = vniRegex.test(combinedText);
            
            if (!isTCVN3 && (combinedText.includes("¤ã") || combinedText.includes("¡ê"))) isTCVN3 = true;
            if (!isVNI && (combinedText.includes("ðañ") || combinedText.includes("ðeñ"))) isVNI = true;

            if (isTCVN3) return 'TCVN3';
            if (isVNI) return 'VNI';
            return 'NONE';
        }
    };
})();

if (typeof window !== 'undefined') window.VietEncoder = VietEncoder;
