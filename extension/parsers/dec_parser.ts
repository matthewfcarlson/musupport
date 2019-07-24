import { promisifyReadFile, stringTrim } from "../utilities";
import { logger } from "../logger";
import { DecData } from "./types";
import * as path from 'path';
import { InfPaser } from "./inf_parser";

export class DecPaser {
    public static async ParseDec(decpath: string): Promise<DecData> {
        // DECs are basically INFs
        return await InfPaser.ParseInf(decpath);
    }
}