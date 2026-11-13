import { describe, expect, it } from "vitest";

import {
  deepseekMergeCount,
  deepseekTokenCount,
  deepseekTokenTexts,
} from "./deepseek.js";

/**
 * 黄金向量 —— 由**官方** Python `tokenizers`(0.23.3)喂 `deepseek_v4_tokenizer`
 * 的 tokenizer.json 实测得出,连 token 串都逐字记下来。
 *
 * 为什么连串一起比而不是只比个数:数对了也可能是「两处错凑巧抵消」。
 * 逐字对齐 token 串才能证明预处理(三个 Split)、字节映射、BPE 优先级这一整条
 * 与官方一致 —— 换个人接手时,跑红就是跑红,不用猜。
 */
const GOLDEN: ReadonlyArray<{ text: string; tokens: string[] }> = [
  { text: "Hello!", tokens: ["Hello","!"] },
  { text: "你好，世界", tokens: ["ä½łå¥½","ï¼Į","ä¸ĸçķĮ"] },
  { text: "{\"a\":1}", tokens: ["{\"","a","\":","1","}"] },
  { text: "  hello  world", tokens: ["Ġ","Ġhello","Ġ","Ġworld"] },
  { text: "\n\nfoo", tokens: ["ĊĊ","foo"] },
  { text: "12345", tokens: ["123","45"] },
  { text: "<｜begin▁of▁sentence｜>hi", tokens: ["<｜begin▁of▁sentence｜>","hi"] },
  { text: "The quick brown fox jumps over the lazy dog.", tokens: ["The","Ġquick","Ġbrown","Ġfox","Ġjumps","Ġover","Ġthe","Ġlazy","Ġdog","."] },
  { text: "用户说：把 packages/core 里的 tokenizer 接上，别再用字符估算了。", tokens: ["çĶ¨æĪ·","è¯´","ï¼ļ","æĬĬ","Ġpackages","/core","Ġ","éĩĮçļĦ","Ġtoken","izer","Ġ","æİ¥","ä¸Ĭ","ï¼Į","åĪ«","åĨįçĶ¨","åŃĹç¬¦","ä¼°","ç®ĹäºĨ","ãĢĤ"] },
  { text: "def f(x: int) -> int:/n    return x + 1  # 加一\n", tokens: ["def","Ġf","(x",":","Ġint",")","Ġ->","Ġint",":/","n","ĠĠĠ","Ġreturn","Ġx","Ġ+","Ġ","1","Ġ","Ġ#","Ġ","åĬł","ä¸Ģ","Ċ"] },
  { text: "Error: ENOENT: no such file or directory, open 'D://projects//as-one//package.json'", tokens: ["Error",":","ĠE","NO","ENT",":","Ġno","Ġsuch","Ġfile","Ġor","Ġdirectory",",","Ġopen","Ġ'","D","://","projects","//","as","-one","//","package",".json","'"] },
  { text: "https://example.com/path?q=1&r=%E4%BD%A0", tokens: ["https","://","example",".com","/p","ath","?","q","=","1","&","r","=%","E","4","%","BD","%A","0"] },
  { text: "emoji 🚀🎉 和生僻字 龘靐齉", tokens: ["emo","ji","ĠðŁ","ļ","Ģ","ðŁİ","ī","Ġ","åĴĮ","çĶŁ","åĥ»","åŃĹ","Ġ","é¾","ĺ","éĿ","Ĳ","é½","ī"] },
  { text: "    \t\t  ", tokens: ["ĠĠĠĠ","ĉĉ","ĠĠ"] },
  { text: "a", tokens: ["a"] },
  { text: "", tokens: [] },
  { text: "你好", tokens: ["ä½łå¥½"] },
  { text: "你好世界你好世界你好世界", tokens: ["ä½łå¥½","ä¸ĸçķĮ","ä½łå¥½","ä¸ĸçķĮ","ä½łå¥½","ä¸ĸçķĮ"] },
  { text: "<｜tool▁call▁begin｜>{\"name\":\"read_file\"}<｜tool▁call▁end｜>", tokens: ["<｜tool▁call▁begin｜>","{\"","name","\":\"","read","_file","\"}","<｜tool▁call▁end｜>"] },
  { text: "混合 mixed 中英 123abc ABC中文 空格  双空格", tokens: ["æ··åĲĪ","Ġmixed","Ġ","ä¸Ń","èĭ±","Ġ","123","abc","ĠABC","ä¸Ńæĸĩ","Ġ","ç©ºæł¼","ĠĠ","åıĮ","ç©ºæł¼"] },
  { text: "\r\n\r\n第二行\r\n", tokens: ["č","Ċ","č","Ċ","ç¬¬äºĮ","è¡Į","č","Ċ"] },
  { text: "SELECT * FROM real_model WHERE provider = ? AND model_id LIKE '%deepseek%';", tokens: ["SELECT","Ġ*","ĠFROM","Ġreal","_model","ĠWHERE","Ġprovider","Ġ=","Ġ?","ĠAND","Ġmodel","_id","ĠLIKE","Ġ'%","deep","seek","%","';"] },
  { text: "{\"a\": [1, 2, 3], \"b\": {\"c\": \"中文\"}}", tokens: ["{\"","a","\":","Ġ[","1",",","Ġ","2",",","Ġ","3","],","Ġ\"","b","\":","Ġ{\"","c","\":","Ġ\"","ä¸Ńæĸĩ","\"","}}"] },
  { text: "0.5 100% 3.14159 -42 +7", tokens: ["0",".","5","Ġ","100","%","Ġ","3",".","141","59","Ġ-","42","Ġ+","7"] },
  { text: "「引用」《书名》…—— 破折号", tokens: ["ãĢĮ","å¼ķçĶ¨","ãĢį","ãĢĬ","ä¹¦åĲį","ãĢĭ","âĢ¦","âĢĶâĢĶ","Ġ","çł´","æĬĺ","åı·"] },
  { text: "ＦＵＬＬ　ｗｉｄｔｈ　ｔｅｘｔ", tokens: ["ï¼","¦","ï¼","µ","ï¼","¬","ï¼","¬","ãĢĢ","ï½","Ĺ","ï½ī","ï½","Ħ","ï½Ķ","ï½","Ī","ãĢĢ","ï½Ķ","ï½ħ","ï½","ĺ","ï½Ķ"] },
  { text: "let x = { foo: 'bar', baz: [1,2,3] } // 注释", tokens: ["let","Ġx","Ġ=","Ġ{","Ġfoo",":","Ġ'","bar","',","Ġbaz",":","Ġ[","1",",","2",",","3","]","Ġ}","Ġ//","Ġ","æ³¨éĩĬ"] },
  { text: "\\u4f60\\u597d", tokens: ["\\u","4","f","60","\\u","597","d"] },
  { text: "line1\nline2\nline3\n", tokens: ["line","1","Ċ","line","2","Ċ","line","3","Ċ"] },
  { text: "🤖", tokens: ["ðŁ¤","ĸ"] },
  { text: "［全角方括号］；：？！、", tokens: ["ï¼»","åħ¨","è§Ĵ","æĸ¹","æĭ¬åı·","ï¼½","ï¼Ľ","ï¼ļ","ï¼Łï¼ģ","ãĢģ"] },
  { text: "ＡＢＣ１２３", tokens: ["ï¼¡","ï¼¢","ï¼£","ï¼ĳï¼Ĵ","ï¼ĵ"] },
  { text: "aaa bbb ccc ddd eee fff", tokens: ["aaa","Ġb","bb","Ġc","cc","Ġd","dd","Ġe","ee","Ġf","ff"] },
  { text: "日本語のテキストとひらがなとカタカナ", tokens: ["æĹ¥æľ¬èªŀ","ãģ®","ãĥĨ","ãĤŃ","ãĤ¹ãĥĪ","ãģ¨","ãģ²","ãĤī","ãģĮ","ãģª","ãģ¨","ãĤ«","ãĤ¿","ãĤ«","ãĥĬ"] },
  { text: "한국어 텍스트", tokens: ["íķľ","êµŃ","ìĸ´","Ġíħ","į","ìĬ¤íĬ¸"] },
  { text: "   ", tokens: ["ĠĠĠ"] },
  { text: "\t", tokens: ["ĉ"] },
  { text: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", tokens: ["xxxxxxxx","xxxxxxxx","xxxxxxxx","xxxxxxxx","xxxxxxxx","xxxxxxxx","xxxxxxxx","xxxxxxxx","xxxxxxxx","xxxxxxxx","xxxxxxxx","xxxxxxxx","xxxxxxxx","xxxxxxxx","xxxxxxxx","xxxxxxxx","xxxxxxxx","xxxxxxxx","xxxxxxxx","xxxxxxxx","xxxxxxxx","xxxxxxxx","xxxxxxxx","xxxxxxxx","xxxxxxxx"] },
  { text: "中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中中", tokens: ["ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń","ä¸Ń"] },
  { text: "word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word ", tokens: ["word","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġword","Ġ"] },
];

describe("DeepSeek V4 tokenizer", () => {
  it("token 串与官方逐字一致", () => {
    for (const { text, tokens } of GOLDEN) {
      expect(deepseekTokenTexts(text), JSON.stringify(text)).toEqual(tokens);
    }
  });

  it("token 数与官方逐字一致", () => {
    for (const { text, tokens } of GOLDEN) {
      expect(deepseekTokenCount(text), JSON.stringify(text)).toBe(tokens.length);
    }
  });
});

/**
 * 边界样本 —— 同样由官方 tokenizers 实测(数字是官方编码出的 token 数)。
 *
 * 挑这几类不是随手:它们各自踩在一个容易写错的地方。
 */
const EDGE: ReadonlyArray<{ text: string; count: number; why: string }> = [
  { text: "x".repeat(47) + "yy", count: 9, why: "短片段路径(47+2 个符号,还在 O(n²) 分支)" },
  { text: "x".repeat(48) + "yy", count: 7, why: "跨到堆版本的临界点(BPE 的结果**不单调**,别拿「越长越多」当断言)" },
  { text: "x".repeat(49) + "yy", count: 8, why: "堆版本本身" },
  { text: "中".repeat(700), count: 700, why: "中文按 1 token/字(字符加权估算只算 0.75)" },
  { text: "ab".repeat(300), count: 300, why: "长重复串" },
  { text: "a".repeat(500), count: 63, why: "重复字母被合并成 8 字一组" },
  { text: " ".repeat(200), count: 3, why: "空白整段被合并" },
  { text: "\n".repeat(100), count: 7, why: "换行 16 个一组" },
  { text: "1234567890".repeat(20), count: 67, why: "数字按 1~3 位切块" },
  { text: "hello world ".repeat(50), count: 101, why: "空格归属:词首空格算前一个 token(Ġworld)" },
  { text: "a<｜end▁of▁sentence｜>b", count: 3, why: "嵌在文本里的特殊 token 整段算 1 个" },
  { text: "<think>reasoning</think>", count: 4, why: "<think> / </think> 是特殊 token,中间的词照常分词" },
  { text: "<dsml:invoke>", count: 4, why: "长得像特殊 token 但不是 → 绝不能被当成 1 个" },
  { text: "｜DSML｜", count: 1, why: "以全角竖线开头的那个特殊 token" },
  { text: "中文 english 混合 123 abc!@#", count: 10, why: "中英数标点混排" },
];

describe("DeepSeek V4 tokenizer 边界", () => {
  it("官方计数逐个对上", () => {
    for (const { text, count, why } of EDGE) {
      expect(deepseekTokenCount(text), why).toBe(count);
    }
  });

  it("合并表建全了(生成的词表文件与官方 merges 条数一致)", () => {
    // 少一条 merges 只会让某几个词多切一刀,不报错、只悄悄数不准 —— 所以要钉住。
    expect(deepseekMergeCount()).toBe(127_741);
  });

  it("同一个输入连算两次结果一致(没有依赖调用顺序的脏状态)", () => {
    const text = "用户说:把 tokenizer 接上;顺便把 12345 和 <｜User｜> 也算进去。";
    expect(deepseekTokenCount(text)).toBe(deepseekTokenCount(text));
    expect(deepseekTokenTexts(text)).toEqual(deepseekTokenTexts(text));
  });
});
