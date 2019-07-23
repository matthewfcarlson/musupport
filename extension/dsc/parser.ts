import { IDscData, IDscDataExtended, IDscDefines, IDscPcd, ISourceInfo, IDscError } from '../parsers/types';
import { promisifyReadFile, stringTrim } from "../utilities";
import { logger } from "../logger";
import * as path from 'path';
import { Uri } from 'vscode';
import { PathLike } from 'fs';
import { ErrorCodes } from 'vscode-jsonrpc';

// Parses a DSC file, including !include

class DscData {

}

interface DscLine {
  line: String,
  lineNo: Number
}

interface IParseStack {
  source: ISourceInfo;
  lines: DscLine[];
}

export class DscPaser {

  private static FindDefine(name:String): IDscDefines[]{
    return [];
  }
  private static FindPcd(name:String): IDscPcd[]{
    return [];
  }

  private static ToDscData(): IDscData {
    return null;
  }

  private static async GetCleanLinesFromUri(file: Uri): Promise<DscLine[]> {
    var lines = [];

    return null;
  }

  private static MakeError(msg:String, line:String, source:ISourceInfo, isFatal:Boolean=false): IDscError {

    var result: IDscError = {
      source: source,
      text:line,
      error_msg: msg,
      isFatal: isFatal,
      toString: () => {
        return msg + " from " + source.uri.toString() + ":" + source.lineno
      }
    }

    return result;
  }

  

  public static async ParseFull(dscpath: Uri, workspacePath: Uri): Promise<IDscDataExtended> {
    var data: IDscDataExtended = {
      filePath: dscpath,
      defines: [],
      findDefine: DscPaser.FindDefine, //search for a define by name
      libraries: [],
      pcds: [],
      findPcd: DscPaser.FindPcd,
      toDscData: DscPaser.ToDscData, //returns the DSC data in a simpler format
      errors: []
    };

    var sources: ISourceInfo;
    var parseStack: IParseStack[];
    parseStack.push( {
      source : {
        uri: dscpath,
        lineno: 0,
        column: 0, //if we don't have a column or don't know, it's 0
      },
      lines: null
    });

    //first we need to open the file
    while (parseStack.length != 0){
      var currentParsing = parseStack[0];
      if (currentParsing.lines == null) {
        currentParsing.lines = await DscPaser.GetCleanLinesFromUri(currentParsing.source.uri);
        if (currentParsing.lines == null) { // if we can't open the file, create an error of the particular
          parseStack.shift();
          currentParsing = parseStack[0];
          data.errors.push(this.MakeError("Unable to open file", "", currentParsing.source, true));
          continue;
        }
      }
      
      // go through all the 
      while (currentParsing.lines.length != 0) {
        var currentLine = currentParsing.lines.shift(); //the lines are pre cleaned
        // comments are removed
        currentParsing.source.column = 0;
        currentParsing.source.lineno = currentLine.lineNo;
        if (currentLine.line.startsWith("!include")) { // if we're on the include path
          //TODO: unshift a new parsing onto the stack
          break;
        }
        else {

        }
      }
    }
    return data;
  }
  
  public static async Parse(dscpath: Uri, workspacePath: Uri): Promise<IDscData> {
    //TODO eventually write a second reduced parser. For now, just do a full parse and trim it down
    return (await this.ParseFull(dscpath, workspacePath)).toDscData();
  }
   
}   
      