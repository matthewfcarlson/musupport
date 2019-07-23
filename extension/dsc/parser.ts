import { IDscData, IDscDataExtended, IDscDefines, IDscPcd, ISourceInfo, IDscError } from '../parsers/types';
import { promisifyReadFile, stringTrimLeft, stringTrimRight } from "../utilities";
import { logger } from "../logger";
import * as path from 'path';
import { Uri } from 'vscode';
import { PathLike } from 'fs';
import { ErrorCodes } from 'vscode-jsonrpc';
import * as vscode from 'vscode';

// Parses a DSC file, including !include

class DscData {

}

interface DscLine {
  line: String,
  lineNo: Number,
  columnOffset: Number
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

  // This get the lines from a DSC
  private static async GetCleanLinesFromUri(file: Uri): Promise<DscLine[]> {
    var lines = [];

    //TODO figure out how to read a URI instead of relying on the filesystem
    let filePath = file.fsPath;
    try {
      let fileContents = await promisifyReadFile(filePath);
      let fileArray = fileContents.split("\n");
      logger.info("filearray", fileArray);
      // map the raw text to DSC lines
      let lineArray = fileArray.map((line, i) => {
        let line_length = line.length;
        line = stringTrimLeft(line);
        let column = line_length - line.length; //keep track of how much we snipped
        
        //remove comments
        let pound_index = line.indexOf("#");
        if (pound_index == 0) { // if it's the first character, just make sure it's an empty string
          line = "";
        }
        if (pound_index != -1) { // if we have a comment
          line = line.substring(0, pound_index);
        }
        //make sure to clean up after the comment
        line = stringTrimRight(line);
        //put the data in that we care about
        var line_data: DscLine = {
          line: line,
          lineNo: i + 1, // one more than our current position in the array
          columnOffset: column
        };
        return line_data;
      });
      logger.info("linearray", fileArray);

      //remove lines that are whitespace
      lineArray = lineArray.filter( (line) => {
        if (line.line.length == 0) return false;
        return true;
      });
      logger.info("linearray", fileArray);

      return lineArray;

    }
    catch {
      return null;
    }
  }

  private static MakeError(msg:String, line:String, source:ISourceInfo, isFatal:Boolean=false): IDscError {

    var result: IDscError = {
      source: source,
      text:line,
      error_msg: msg,
      isFatal: isFatal,
      toString: () => {
        return msg + "@" + source.uri.toString() + ":" + source.lineno
      }
    }
    return result;
  }

  

  public static async ParseFull(dscpath: Uri|PathLike, workspacePath: Uri|PathLike): Promise<IDscDataExtended> {
    var data: IDscDataExtended = {
      filePath: Uri.parse(dscpath.toString()),
      defines: [],
      findDefine: DscPaser.FindDefine, //search for a define by name
      libraries: [],
      pcds: [],
      findPcd: DscPaser.FindPcd,
      toDscData: DscPaser.ToDscData, //returns the DSC data in a simpler format
      errors: []
    };

    var sources: ISourceInfo;
    var parseStack: IParseStack[] = [];
    parseStack.push( {
      source : {
        uri: Uri.parse(dscpath.toString()),
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
        //TODO: add more of the section
        if (current)
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
      