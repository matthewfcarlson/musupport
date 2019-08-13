import { promisifyReadFile, stringTrim, isNumeric, Path } from '../utilities';
import { IDscData, IDscDataExtended, DscDefines, DscPcd, SourceInfo, DscError, DscSections, DscPcdType, DscComponent, DscLibClass, DscSectionDescription } from '../parsers/types';
import { logger } from "../logger";
import * as path from 'path';
import { Uri } from 'vscode';
import { PathLike } from 'fs';
import { ErrorCodes } from 'vscode-jsonrpc';
import * as vscode from 'vscode';
import { InfPaser } from '../parsers/inf_parser';

// Parses a DSC file, including !include

interface DscLine {
  line: string,
  lineNo: number,
  columnOffset: number
}

interface IParseStack {
  source: SourceInfo;
  lines: DscLine[];
}

// A section that we want to parse like Define or
interface IParseSection {
  type: DscSections|DscPcdType;
  kind: string[]; //common, x64, common.PEIM
  variables: DscDefines[]; // variables we've found in this section
}

export class DscParser {

  private static FindDefine(name:string): DscDefines[]{
    return [];
  }
  private static FindPcd(name:string): DscPcd[]{
    return [];
  }

  private static ToDscData(): IDscData {
    return null;
  }

  public static GetPossibleSections(): string[] {
    var validSections: string[] = [];
    for(var n in DscSections) {
      if (isNumeric(n)) continue;
      validSections.push(n);
    }
    for(var n in DscPcdType) {
      if (isNumeric(n)) continue;
      validSections.push("Pcds"+n);
    }
    return validSections;
  }

  // This get the lines from a DSC
  private static async GetCleanLinesFromUri(file: Uri): Promise<DscLine[]> {

    //TODO figure out how to read a URI instead of relying on the filesystem read file
    let filePath = file.fsPath;
    try {
      let fileContents = await promisifyReadFile(filePath);
      let fileArray = fileContents.split("\n");
      // map the raw text to DSC lines
      let lineArray = fileArray.map((line, i) => {
        let line_length = line.length;
        line = line.trimLeft();
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
        let final_line = line.replace('\n',"").replace('\r',"").trimRight(); //remove new line characters, we will be adding our own

        //put the data in that we care about
        var line_data: DscLine = {
          line: final_line,
          lineNo: i + 1, // one more than our current position in the array
          columnOffset: column
        };
        return line_data;
      });
      //remove lines that are whitespace
      lineArray = lineArray.filter( (line) => {
        if (line.line.length == 0) return false;
        return true;
      });
      return lineArray;

    }
    catch {
      return null;
    }
  }

  private static MakeError(msg:string, error_line:string, code_line:string, code_source:SourceInfo, isFatal:Boolean=false): DscError {
    let column = code_source.column;
    if (column < 0){
      column = 0;
    }
    if (error_line.length != code_line.length) {
      // only add the offset of the actual error if it isn't the same as the line itself
      column += code_line.indexOf(error_line);
    }
    const source:SourceInfo = {
      uri: code_source.uri,
      lineno: code_source.lineno,
      conditional: code_source.conditional,
      column: column
    }
    var result = new DscError(source, code_line, msg, isFatal);
    return result;
  }

  // Converts an array of strings such as ["COMMON.x64", "IPC.DXE_DRIVER"]
  private static ParseSectionDescriptors(parts: string[]): DscSectionDescription[] {
    return [];
  }

  private static ParseLibraryClassLine(line: string, source: SourceInfo, section: IParseSection): DscLibClass|DscError {
    if (line.indexOf("|") == -1) {
      return this.MakeError("A library class statement must have a =", line, line, source, true);
    }
    let parts = line.split("|");
    if (parts.length > 2) {
      this.MakeError("Too many pipes signs", parts[2], line, source, false);
    }
    let key = parts[0].trim();
    if (key.indexOf(" ") != -1) {
      this.MakeError("The library class can't have spaces", key, line, source, false);
    }

    let infPath = "";
    let archs = DscParser.ParseSectionDescriptors(section.kind);
    //TODO figure out how to get the current architecture that this line applies to?
    //From source info- it's space inefficent :( Maybe
    var result = new DscLibClass(source, new Path(infPath), archs, key, "");
    return result;
  }

  private static ParseDefineLine(line: string, source: SourceInfo): DscDefines|DscError {

    if (line.indexOf("=") == -1) {
      return this.MakeError("A define statement must have a =", line, line, source, true);
    }
    let parts = line.split("=");
    if (parts.length > 2) {
      this.MakeError("Too many equal signs", parts[2], line, source, false);
    }
    let key = parts[0].trim();
    if (key.indexOf(" ") != -1) {
      this.MakeError("The define key can't have spaces", key, line, source, false);
    }
    //TODO check for more invalid characters in value/key
    let value = parts[1].trim();
    if (value.indexOf(" ") != -1 && (!value.startsWith('"') || !value.endsWith('"'))) {
      this.MakeError("You need to wrap values with spaces in quotes", value, line, source, false);
    }
    value = value.replace('"', ""); // strip the " off
    return {
      source: source,
      key: key,
      value: value
    };
  }

  // Using the defines as they
  public static ResolveVariables(line: DscLine, data: IDscDataExtended, section: IParseSection): string {
    if (line.line.indexOf("$") != -1) {
      logger.warn("We don't know how to resolve the variable: " + line);
    }
    let resolved_line = line.line;
    // Add this ymbol to the list of symbols we can resolve
    return resolved_line;
  }

  public static async ParseFull(dscpath: Uri|PathLike, workspacePath: Uri|PathLike): Promise<IDscDataExtended> {
    let data: IDscDataExtended = {
      filePath: Uri.parse(dscpath.toString()),
      defines: [],
      findDefine: DscParser.FindDefine, //search for a define by name
      libraries: [],
      pcds: [],
      findPcd: DscParser.FindPcd,
      toDscData: DscParser.ToDscData, //returns the DSC data in a simpler format
      errors: [],
      symbols: [],
    };

    let parseStack: IParseStack[] = [];
    parseStack.push( {
      source : {
        uri: Uri.parse(dscpath.toString()),
        lineno: 0,
        column: 0, //if we don't have a column or don't know, it's 0
      },
      lines: null
    });

    let validSections = DscParser.GetPossibleSections();
    let currentSection:IParseSection = {
      type: null,
      kind: null,
      variables: [],
    };

    //first we need to open the file
    while (parseStack.length != 0){
      var currentParsing = parseStack[0];
      if (currentParsing.lines == null) {
        currentParsing.lines = await DscParser.GetCleanLinesFromUri(currentParsing.source.uri);
        if (currentParsing.lines == null) { // if we can't open the file, create an error of the particular
          parseStack.shift();
          logger.info("We weren't able to open the file");
          data.errors.push(this.MakeError("Unable to open file", "", "", currentParsing.source, true));
          continue;
        }
      }
      
      // go through all the lines
      while (currentParsing.lines.length != 0) {
        var currentLine = currentParsing.lines.shift(); //the lines are pre cleaned
        currentLine.line = DscParser.ResolveVariables(currentLine, data, currentSection); // resolve any macros/variables that we find
        // comments are removed
        currentParsing.source.column = 0;
        currentParsing.source.lineno = currentLine.lineNo;
        if (currentLine.line.startsWith("DEFINE")){
          //TODO handle defines properly
          logger.warn("We don't know to deal with "+ currentLine.line);
        }
        if (currentLine.line.startsWith("!include")) { // if we're on the include path
          var path = currentLine.line.replace("!include","").trim();
          //TODO handle the relative path
          parseStack.unshift( {
            source : {
              uri: Uri.parse(path),
              lineno: 0,
              column: 0, //if we don't have a column or don't know, it's 0
            },
            lines: null
          });
          break;
        }
        else if (currentLine.line.startsWith("!if")) {
          //TODO: handle the conditional
          logger.warn("Skipping conditional because we don't know what to do with it")
        }
        else if (currentLine.line == "!else") {
          //TODO handle the else
        }
        else if (currentLine.line == "!endif") {
          //TODO handle the end of the if
        }

        else if (currentLine.line.startsWith("[") && currentLine.line.endsWith("]")) { //if we're on a new section
          //handle the new section
          let sectionTypes = currentLine.line.replace("[","").replace("]","").split(",").map(stringTrim); //get a list of the sections in the brackets
          let sectionTypeLists = sectionTypes.map((x)=> {
            return x.split(".");
          });
          let sectionType = sectionTypeLists[0][0];

          for (var i = 0; i < sectionTypeLists.length; i++){
            let currentSectionType = sectionTypeLists[i].shift();
            if (currentSectionType != sectionType) { //make sure all the sections match
              //we're going to keep parsing and assume we're correct in the future?
              data.errors.push(this.MakeError("Section type does not match rest of section", currentSectionType, currentLine.line, currentParsing.source, false));
            }
            //TODO validate each of the types to make sure it's valid
            if (validSections.indexOf(currentSectionType) == -1){
              data.errors.push(this.MakeError("Section type is not a valid section", currentSectionType, currentLine.line, currentParsing.source, true));
            }
          }

          let sectionTypeDescriptors = [];
          sectionTypeLists.forEach((x)=>{
            let type = x.join(".");
            sectionTypeDescriptors.push(type);
          });

          var sectionTypeEnum:DscPcdType|DscSections = sectionType.startsWith("Pcds")?DscPcdType[sectionType.substr(4)]:DscSections[sectionType];

          if (sectionTypeEnum == undefined) {
            data.errors.push(this.MakeError("Section type is not a valid section", sectionType, currentLine.line, currentParsing.source, true));
            currentSection.type = null;
            continue;
          }
          //clear out our current section tyoe
          currentSection.type = sectionTypeEnum;
          currentSection.kind = sectionTypeDescriptors;
          currentSection.variables = [];
          if (currentSection.type == DscSections.Defines && currentSection.kind.length > 0 && currentSection.kind[0].length > 0) { // check if we have any architecutures for defines
            data.errors.push(this.MakeError("Define sections can't have architectures" + currentSection.kind[0], currentSection.kind[0], currentLine.line, currentParsing.source, false));
          }
        }
        else if (currentSection.type == null){
          data.errors.push(this.MakeError("This line doesn't coorespond to a good section", currentLine.line, currentLine.line, currentParsing.source, true));
          logger.warn("Unknown section: "+currentLine.line);
        }
        else if (currentSection.type == DscSections.Defines) {
          let results = this.ParseDefineLine(currentLine.line, currentParsing.source);

          if (results instanceof DscError) {
            data.errors.push(results);
            continue;
          }
          //TODO check if we already have this defines in the DSC
          data.defines.push(results);

        }
        else if (currentSection.type == DscSections.LibraryClasses) {
          let results = this.ParseLibraryClassLine(currentLine.line, currentParsing.source, currentSection);

          if (results instanceof DscError) {
            data.errors.push(results);
            continue;
          }
          //TODO check if we already have this library class in the DSC
          data.libraries.push(results);
        }
        else {
          //We don't know what to do with this line
        }

      } // end of lines == 0
      //lines should be zero
      parseStack.shift(); // shift off the parse stack
    }

    //TODO do checks on the final
    //TODO check if DSC version is included 0x0001001C or 1.28
    //TODO check if PlatformGuid is valid and good
    //TODO check PLATFORM_VERSION
    //TODO check PLATFORM_NAME
    return data;
  }

  public static async Parse(dscpath: Path, workspacePath: Uri): Promise<IDscData> {
    //TODO eventually write a second reduced parser. For now, just do a full parse and trim it down
    //return (await this.ParseFull(dscpath, workspacePath)).toDscData();

    // HACKY INF PARSER
    let inf = await InfPaser.ParseInf(dscpath);
    if (inf && inf.defines) {

      let components = inf.components.map((comp) => {
        let def: DscComponent = {
          descriptors: null,
          infPath: new Path(comp),
          libraryClasses: null,
          source: null
        };
        return def;
      })

      let dsc: IDscData = {
        filePath: dscpath,
        components: components,
        libraries: inf.libraryClasses,
        pcds: null,
        defines: inf.defines,
      };
      return dsc;
    }
    return null;
  }
}
