import process from "node:process";
import { URL } from "node:url";
import console from "node:console";
import ts from "typescript";
import { readFileSync, writeFileSync } from "node:fs";
const [input, output, sourceUrl, observedAt] = process.argv.slice(2);
if (!input || !output || !sourceUrl || !/^\d{4}-\d{2}-\d{2}$/.test(observedAt ?? ""))
    throw Error("Usage: node scripts/extract-avatar-layers.mjs input.js output.json official-source-url YYYY-MM-DD");
const origin = new URL(sourceUrl);
if (origin.username || origin.password || origin.search || origin.hash || origin.origin !== "https://splinterlands.com" || !origin.pathname.startsWith("/assets/"))
    throw Error("Expected an official client asset URL");
const source = readFileSync(input, "utf8");
if (source.length > 12000000)
    throw Error("Client source exceeds the extraction bound");
const ast = ts.createSourceFile(input, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const declarations = new Map();
function walk(n) { if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name))
    declarations.set(n.name.text, n.initializer); ts.forEachChild(n, walk); }
walk(ast);
walk(declarations.get("buildAppearanceConfiguration").body);
const prop = (n, k) => n.properties.find(p => p.name && p.name.getText(ast).replaceAll('"', '') === k)?.initializer;
function numeric(n) { if (ts.isNumericLiteral(n))
    return Number(n.text); if (ts.isIdentifier(n)) {
    const d = declarations.get(n.text);
    if (d && ts.isNumericLiteral(d))
        return Number(d.text);
} throw Error("Unresolved numeric " + n.getText(ast)); }
function values(n) { if (!n)
    return []; if (!ts.isArrayLiteralExpression(n))
    throw Error("Expected array"); return n.elements.flatMap(x => { if (ts.isSpreadElement(x)) {
    const d = declarations.get(x.expression.getText(ast));
    return values(d);
} if (!ts.isObjectLiteralExpression(x))
    throw Error("Expected option object"); const v = prop(x, "value"); if (v)
    return [{ value: numeric(v), colors: values(prop(x, "colors")).map(c => c.value) }]; const spread = x.properties.find(ts.isSpreadAssignment); if (spread) {
    const d = declarations.get(spread.expression.getText(ast));
    return [{ value: numeric(prop(d, "value")), colors: [] }];
} throw Error("Missing option value"); }); }
function template(n) { if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "concat" && n.arguments.length === 2 && n.arguments[0].getText(ast) === "window.config.SL_ASSETS_URL" && ts.isStringLiteral(n.arguments[1]))
    return n.arguments[1].text; throw Error("Unexpected asset template"); }
let array;
function findReturn(n) { if (ts.isReturnStatement(n) && n.expression && ts.isArrayLiteralExpression(n.expression))
    array = n.expression; ts.forEachChild(n, findReturn); }
findReturn(declarations.get("buildAppearanceConfiguration").body);
const configs = array.elements.map(r => {
    const menu = prop(r, "menu");
    const items = [];
    for (const section of menu.elements) {
        if (ts.isSpreadElement(section))
            continue;
        for (const item of prop(section, "itemsList").elements) {
            const key = prop(item, "dbKeyItem");
            if (!key)
                throw Error("Missing key");
            const paths = prop(item, "basePath").elements.map(p => ({ path: template(prop(p, "image")), layer: numeric(prop(p, "layer")), validOptions: prop(p, "validOptions")?.elements.map(numeric) }));
            items.push({ key: key.text, colorKey: prop(item, "dbKeyColor")?.text, paths, colors: values(prop(item, "colors")).map(c => c.value), options: values(prop(item, "options")) });
        }
    }
    return { race: prop(r, "bloodline").text, gender: numeric(prop(r, "body")), items };
});
if (configs.length !== 8 || new Set(configs.map(c => c.race + c.gender)).size !== 8)
    throw Error("Avatar body variants changed; review required");
const backgroundValues = ["SPRING_FOREST_BACKGROUND_VALUE", "VEGA_BG_VALUE", "EIGTH_ANNIVERSARY_BG_VALUE"].map(name => numeric(declarations.get(name)));
if (!source.includes('generateOptionsLocked(15,x,"background")') || !source.includes('generateOptionsLocked(25,x,"frame")'))
    throw Error("Common avatar options changed; review required");
const result = { source: sourceUrl, observedAt, backgrounds: [...Array(16).keys(), ...backgroundValues], frames: [...Array(26).keys()], configurations: configs };
writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log("Extracted " + configs.length + " variants; review before replacing the committed mapping.");
