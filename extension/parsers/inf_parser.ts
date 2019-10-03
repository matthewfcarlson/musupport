import { promisifyReadFile, stringTrim, Path } from "../utilities";
import { logger } from "../logger";
import * as path from 'path';
import { InfData, DscLibClass, DscGuid } from "./types";

export class InfPaser {
    public static async ParseInf(infpath: Path): Promise<InfData> {
        // Join continued lines

        var data: InfData = {
            includes: [],
            defines: null,
            sources: [],
            packages: [],
            protocols: [],
            pcds: [],
            guids: [],
            components: [],
            libraryClasses: [],
            infPath: infpath
        };
        try {
            const str = await promisifyReadFile(infpath.toString());
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
            if (rawInfData["Includes"] != undefined) data.includes = data.includes.concat(rawInfData["Includes"]);
            if (rawInfData["Defines"] != undefined) data.defines = this.parseMap(rawInfData["Defines"]);
            if (rawInfData["Sources"] != undefined) data.sources = data.sources.concat(rawInfData["Sources"]);
            if (rawInfData["Packages"] != undefined) data.packages = data.packages.concat(rawInfData["Packages"]);
            if (rawInfData["Protocols"] != undefined) data.protocols = data.protocols.concat(this.parseGuids(rawInfData["Protocols"]));
            if (rawInfData["Guids"] != undefined) data.guids = data.guids.concat(this.parseGuids(rawInfData["Guids"]));
            if (rawInfData["Pcd"] != undefined) data.pcds = data.pcds.concat(rawInfData["Pcd"]);
            if (rawInfData["Components"] != undefined) data.components = data.components.concat(this.parseComponent(rawInfData["Components"]));
            if (rawInfData["LibraryClasses"] != undefined) data.libraryClasses = data.libraryClasses.concat(this.parseLibraryClasses(rawInfData["LibraryClasses"], infpath.parent));
        }
        catch (err) {
            logger.error("INF_PARSER ERROR", err)
            logger.info("INF_PARSER parse failed")
            logger.error(JSON.stringify(err));
            logger.error(typeof err);
        }
        const infDirPath = infpath.dirname;

        data.sources = data.sources.map(x => path.join(infDirPath, x))
        data.includes = data.includes.map(x => path.join(infDirPath, x))

        return Promise.resolve(data);
    }

    private static parseLibraryClasses(lines: string[], infPath: Path): DscLibClass[] {
        let items: DscLibClass[] = [];
        for (let ln of lines) {
            let [classname, path] = ln.split('|');
            if (classname) { classname = classname.trim(); }
            if (path) { path = path.trim(); }
            if (classname && path) {
                let item: DscLibClass = {
                    className: classname,
                    name: null,
                    descriptors: null,
                    infPath: new Path(path), // relative path
                    source: null
                };
                items.push(item);
            }
        }
        return items;
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

    private static parseGuids(lines: string[]) : DscGuid[] {
        let items: DscGuid[] = [];
        for (let ln of lines) {
            let [name, guid] = ln.split('=', 2);
            if (name) { name = name.trim(); }
            if (guid) { guid = guid.trim(); }
            if (name && guid) {
                let item: DscGuid = {
                    name: name,
                    guid: guid
                };
                items.push(item);
            }
        }
        return items;
    }

    private static parseComponent(comp: string[]) {
        // HACK: Remove lines that don't look like component definitions (eg. preprocessor syntax, library overrides)
        let re = new RegExp('^[\\w/\\\\]+\\.inf');
        return comp.map((c) => {
            let results = re.exec(c);
            if (results && results.length >= 1) {
                return results[0];
            }
            return null;
        }).filter((c) => (c != null));
    }
}