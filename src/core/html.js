// ============================================================
// WITA — HTML BUILDER
// Static helpers for constructing journal/chat HTML.
// Replaces all inline string concatenation and parts.push() patterns.
// ============================================================

export class WITAHtml {

    // Build a complete <table> with thead and tbody.
    // headers: string[]  rows: string[]  caption?: string
    static table(headers, rows, caption = null) {
        const cap   = caption ? `<caption>${caption}</caption>` : "";
        const heads = `<tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr>`;
        const body  = Array.isArray(rows) ? rows.join("\n") : rows;
        return `<table>${cap}<thead>${heads}</thead><tbody>${body}</tbody></table>`;
    }

    // Build a <tr> with <td> cells. Optional trailing plain-object sets row attributes.
    // Usage: WITAHtml.row("Foo", "Bar")
    //        WITAHtml.row("Foo", "Bar", { "data-x": "1" })
    static row(...args) {
        let attrs = {};
        if (args.length && args[args.length - 1] !== null
                && typeof args[args.length - 1] === "object"
                && !Array.isArray(args[args.length - 1])) {
            attrs = args.pop();
        }
        const attrStr = Object.entries(attrs).map(([k, v]) => ` ${k}="${v}"`).join("");
        return `<tr${attrStr}>${args.map(c => `<td>${c}</td>`).join("")}</tr>`;
    }

    // Build a <tr> with <th> header cells.
    static headerRow(...cells) {
        return `<tr>${cells.map(c => `<th>${c}</th>`).join("")}</tr>`;
    }

    // Build a section: <h2>icon title</h2> + body + <hr>
    static section(icon, title, body) {
        return `<h2>${icon} ${title}</h2>${body}<hr>`;
    }

    // Build a subsection: <h3>title</h3> + body
    static subsection(title, body) {
        return `<h3>${title}</h3>${body}`;
    }

    // Filter falsy values, join non-empty parts with newline.
    static join(...parts) {
        return parts.filter(Boolean).join("\n");
    }

    // Whisper-safe chat content: <h3>title</h3> + body parts joined.
    static chatMessage(title, ...bodyParts) {
        return `<h3>${title}</h3>\n${WITAHtml.join(...bodyParts)}`;
    }
}
