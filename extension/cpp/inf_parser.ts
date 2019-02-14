import { promisifyReadFile, stringTrim } from "../utilities";
import { logger } from "../logger";

export interface InfData {
    sources: string[];
    packages: string[];
    pcds: string[];
    guids: string[]; // protocols and guids

}
export class InfPaser {
    public static async ParseInf(path: string): Promise<InfData> {
        // Join continued lines

        var data: InfData = {
            sources: [],
            packages: [],
            pcds: [],
            guids: []
        };
        try {
            const str = await promisifyReadFile(path);
            //replace \r\n, strip comments, replace double newlines with just one, replace multiple whitespaces with one
            const lines = str.replace(/\\[\r\n]+/g, '').replace(/\r/g, "\n").replace(/#.*[$\n]/g, '\n').replace(/\n\n+/g, '\n').replace(/[\t ]{2,}/g, " ").split(/\n/)

            var currentSection = "";
            var rawInfData: object = {};
            for (const line of lines) {
                const sanitizedLine = stringTrim(line);
                if (sanitizedLine.length == 0) continue;
                if (sanitizedLine[0] == '[') {
                    const length = (sanitizedLine.indexOf('.') == -1) ? sanitizedLine.length - 1 : sanitizedLine.indexOf('.');
                    currentSection = sanitizedLine.substring(1, length);

                }
                else {
                    if (rawInfData[currentSection] == undefined) rawInfData[currentSection] = [];
                    rawInfData[currentSection].push(sanitizedLine);
                }
            }
            //logger.info("INF_PARSER", rawInfData);
            //process rawInfData
            if (rawInfData["Sources"] != undefined) data.sources = data.sources.concat(rawInfData["Sources"]);
            if (rawInfData["Packages"] != undefined) data.packages = data.packages.concat(rawInfData["Packages"]);
            if (rawInfData["Protocols"] != undefined) data.guids = data.guids.concat(rawInfData["Protocols"]);
            if (rawInfData["Guids"] != undefined) data.guids = data.guids.concat(rawInfData["Guids"]);
            if (rawInfData["Pcd"] != undefined) data.pcds = data.pcds.concat(rawInfData["Pcd"]);
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