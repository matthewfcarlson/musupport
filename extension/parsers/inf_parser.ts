import { promisifyReadFile, stringTrim } from "../utilities";
import { logger } from "../logger";
import * as path from 'path';
import { InfData } from "./types";

export class InfPaser {
    public static async ParseInf(infpath: string): Promise<InfData> {
        // Join continued lines

        var data: InfData = {
            defines: null,
            sources: [],
            packages: [],
            pcds: [],
            guids: [],
            components: [],
            libraryClasses: [],
            infPath: infpath
        };
        try {
            const str = await promisifyReadFile(infpath);
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
            if (rawInfData["Defines"] != undefined) data.defines = this.parseMap(rawInfData["Defines"]);
            if (rawInfData["Sources"] != undefined) data.sources = data.sources.concat(rawInfData["Sources"]);
            if (rawInfData["Packages"] != undefined) data.packages = data.packages.concat(rawInfData["Packages"]);
            if (rawInfData["Protocols"] != undefined) data.guids = data.guids.concat(rawInfData["Protocols"]);
            if (rawInfData["Guids"] != undefined) data.guids = data.guids.concat(rawInfData["Guids"]);
            if (rawInfData["Pcd"] != undefined) data.pcds = data.pcds.concat(rawInfData["Pcd"]);
            if (rawInfData["Components"] != undefined) data.components = data.components.concat(rawInfData["Components"]);
            if (rawInfData["LibraryClasses"] != undefined) data.libraryClasses = data.libraryClasses.concat(rawInfData["LibraryClasses"]);
        }
        catch (err) {
            logger.error("INF_PARSER ERROR", err)
            logger.info("INF_PARSER parse failed")
            logger.error(JSON.stringify(err));
            logger.error(typeof err);
        }
        const infDirPath = path.dirname(infpath);
        data.sources = data.sources.map(x => path.join(infDirPath, x))

        return data;
    }

    private static parseMap(lines: string[]) : Map<string, string> {
        let map: Map<string, string> = new Map<string, string>();

        for (let ln of lines) {
            if (ln) {
                if (ln.startsWith('DEFINE ')) {
                    ln = ln.substr(0, 7);
                }

                let tokens = ln.split('=');
                if (tokens.length == 2) {
                    map.set(tokens[0].trim(), tokens[1].trim());
                }
            }
        }
        return map;
    }
}