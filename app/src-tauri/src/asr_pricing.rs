//! 百炼 ASR 价格表与费用换算。
//!
//! 价格来源：百炼模型页（北京：输入 ¥6 / 输出 ¥4.5 每百万 Token；
//! 新加坡：输入 ¥6.781 / 输出 ¥5.104 每百万 Token）。价格可能调整，
//! 统计只做估算，实际以百炼账单为准。

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Pricing {
    pub region: &'static str,
    /// 人民币微元 / 每百万输入 Token（1 元 = 1_000_000 微元）。
    pub input_micros_per_million: u64,
    pub output_micros_per_million: u64,
}

pub const BEIJING: Pricing = Pricing {
    region: "北京",
    input_micros_per_million: 6_000_000,
    output_micros_per_million: 4_500_000,
};

pub const SINGAPORE: Pricing = Pricing {
    region: "新加坡",
    input_micros_per_million: 6_781_000,
    output_micros_per_million: 5_104_000,
};

/// 按 endpoint 粗分地域；自定义/未知地址按北京价格估算。
pub fn for_endpoint(endpoint: &str) -> Pricing {
    let lower = endpoint.to_ascii_lowercase();
    if lower.contains("dashscope-intl")
        || lower.contains("ap-southeast-1")
        || lower.contains("singapore")
    {
        SINGAPORE
    } else {
        BEIJING
    }
}

/// 输入/输出 Token 换算成人民币微元（四舍五入到微元）。
pub fn cost_micros(input_tokens: u64, output_tokens: u64, pricing: Pricing) -> u64 {
    let total = input_tokens as u128 * pricing.input_micros_per_million as u128
        + output_tokens as u128 * pricing.output_micros_per_million as u128;
    ((total + 500_000) / 1_000_000) as u64
}

pub fn price_note() -> &'static str {
    "按百炼北京/新加坡地域价格估算（输入 ¥6/¥6.781、输出 ¥4.5/¥5.104 每百万 Token），实际以百炼账单为准。"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_region_by_endpoint() {
        assert_eq!(
            for_endpoint("wss://dashscope.aliyuncs.com/api-ws/v1/inference"),
            BEIJING
        );
        assert_eq!(
            for_endpoint("wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference"),
            SINGAPORE
        );
        assert_eq!(
            for_endpoint("wss://abc.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference"),
            BEIJING
        );
        assert_eq!(
            for_endpoint("wss://abc.ap-southeast-1.maas.aliyuncs.com/api-ws/v1/inference"),
            SINGAPORE
        );
    }

    #[test]
    fn converts_tokens_to_micros() {
        // 北京：1M 输入 = 6 元 = 6,000,000 微元；1M 输出 = 4.5 元。
        assert_eq!(cost_micros(1_000_000, 0, BEIJING), 6_000_000);
        assert_eq!(cost_micros(0, 1_000_000, BEIJING), 4_500_000);
        // 85 输入 + 4 输出 ≈ 0.000528 元 ≈ 528 微元。
        assert_eq!(cost_micros(85, 4, BEIJING), 528);
        assert_eq!(cost_micros(0, 0, BEIJING), 0);
    }
}
