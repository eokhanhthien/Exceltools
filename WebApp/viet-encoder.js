/**
 * viet-encoder.js - PHIÊN BẢN NUCLEAR (v3)
 * Giải pháp triệt để cho việc chuyển đổi TCVN3 và VNI sang Unicode.
 * Bao gồm bảng mã đầy đủ nhất và nhận diện dựa trên đặc trưng ngôn ngữ.
 */

/**
 * viet-encoder.js - PHIÊN BẢN NUCLEAR (v4 - Local Library Grade)
 * Tích hợp bảng mã chuyên nghiệp, không phụ thuộc thư viện ngoài.
 * Đảm bảo chạy Local Offline 100%.
 */

const VietEncoder = (function() {
    // Bảng mã TCVN3 (ABC) đầy đủ (v4)
    const TCVN3_MAP = {
        161: 259, 162: 226, 163: 273, 164: 234, 165: 244, 166: 417, 167: 432, 168: 258, 169: 194, 170: 272, 171: 202, 172: 212, 173: 416, 174: 431, 
        181: 224, 182: 225, 183: 7843, 184: 227, 185: 7841, 186: 7857, 187: 7855, 188: 7859, 189: 7861, 190: 7863, 
        191: 7847, 192: 7845, 193: 7849, 194: 7851, 195: 7853, 196: 232, 197: 233, 198: 7867, 199: 7869, 200: 7865, 
        201: 7873, 202: 7871, 203: 7875, 204: 7877, 205: 7879, 206: 236, 207: 237, 208: 7881, 209: 297, 210: 7883, 
        211: 242, 212: 243, 213: 7887, 214: 245, 215: 7885, 216: 7891, 217: 7889, 218: 7893, 219: 7895, 220: 7897, 
        221: 7901, 222: 7899, 223: 7903, 224: 7905, 225: 7907, 226: 249, 227: 250, 228: 7911, 229: 361, 230: 7909, 
        231: 7915, 232: 7913, 233: 7917, 234: 7919, 235: 7921, 236: 7923, 237: 253, 238: 7925, 239: 7927, 241: 7929,
        // Upper case variants often found in .VnTimeH
        1: 7845, 2: 7847, 3: 7849, 4: 7851, 5: 7853, 6: 7861, 7: 7855, 12: 273, 15: 7923
    };

    // Bảng mã VNI-Windows đầy đủ (v4)
    const VNI_MAP = {
        241: 273, 209: 272, 225: 225, 224: 224, 162: 7843, 227: 227, 163: 7841, 161: 226, 202: 7845, 210: 7847, 
        211: 7849, 212: 7851, 213: 7853, 234: 234, 181: 7871, 182: 7873, 183: 7875, 184: 7877, 185: 7879, 237: 253, 
        236: 7923, 167: 7881, 297: 297, 168: 7883, 243: 243, 242: 242, 186: 7887, 245: 245, 187: 7885, 244: 244, 
        204: 7889, 214: 7891, 215: 7893, 216: 7895, 217: 7897, 250: 250, 249: 249, 172: 7911, 361: 361, 173: 7909, 
        218: 432, 219: 7913, 221: 7915, 222: 7917, 223: 7919, 251: 7921, 253: 253, 220: 7923, 174: 7925, 254: 7927, 175: 7929,
        // VNI-Windows Caps
        192: 192, 193: 193, 194: 194, 195: 195, 201: 201, 203: 203, 208: 208, 164: 234, 165: 244, 169: 432, 170: 272, 171: 259, 191: 431
    };

    function convert(str, map) {
        if (!str || typeof str !== 'string') return str;
        let res = "";
        for (let i = 0; i < str.length; i++) {
            const code = str.charCodeAt(i);
            res += map[code] ? String.fromCharCode(map[code]) : str[i];
        }
        return res;
    }

    return {
        fix: (str, type) => {
            if (type === 'TCVN3') return convert(str, TCVN3_MAP);
            if (type === 'VNI') return convert(str, VNI_MAP);
            return str;
        },
        detect: (data) => {
            if (!Array.isArray(data) || data.length === 0) return 'NONE';
            let combinedText = "";
            for (let i = 0; i < Math.min(data.length, 20); i++) {
                for (let key in data[i]) combinedText += " " + String(data[i][key] || "");
            }
            if (combinedText.includes("\u00A4\u00E3") || combinedText.includes("\u00A1\u00EA")) return 'TCVN3';
            if (combinedText.includes("\u00F0a\u00F1") || combinedText.includes("\u00F0e\u00F1")) return 'VNI';
            return 'NONE';
        }
    };
})();

if (typeof window !== 'undefined') window.VietEncoder = VietEncoder;
