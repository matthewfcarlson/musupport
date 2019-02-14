import { promisifyReadFile, stringTrim } from "../utilities";
import { logger } from "../logger";

export interface DecData {
    includes: string[];
}
export class DecPaser {
    public static async ParseDec(path: string): Promise<DecData> {
        // Join continued lines

        var data: DecData = {
            includes: [],
        };
        try {
            const str = await promisifyReadFile(path);
            //replace \r\n, strip comments, replace double newlines with just one, replace multiple whitespaces with one
            const lines = str.replace(/\\[\r\n]+/g, '').replace(/\r/g, "\n").replace(/#.*[$\n]/g, '\n').replace(/\n\n+/g, '\n').replace(/[\t ]{2,}/g, " ").split(/\n/)

            var currentSection = "";
            var rawDecData: object = {};
            for (const line of lines) {
                const sanitizedLine = stringTrim(line);
                if (sanitizedLine.length == 0) continue;
                if (sanitizedLine[0] == '[') {
                    const length = (sanitizedLine.indexOf('.') == -1) ? sanitizedLine.length - 1 : sanitizedLine.indexOf('.');
                    currentSection = sanitizedLine.substring(1, length);

                }
                else {
                    if (rawDecData[currentSection] == undefined) rawDecData[currentSection] = [];
                    rawDecData[currentSection].push(sanitizedLine);
                }
            }
            //logger.info("INF_PARSER", rawDecData);
            //process rawDecData
            if (rawDecData["Includes"] != undefined) data.includes = data.includes.concat(rawDecData["Includes"]);
        }
        catch (err) {
            logger.error("INF_PARSER ERROR", err)
            logger.info("INF_PARSER parse failed")
            logger.error(JSON.stringify(err));
            logger.error(typeof err);
        }
        
        return data;
    }
}