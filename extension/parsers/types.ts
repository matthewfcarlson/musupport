import { Uri } from "vscode";
import { Path } from "../utilities";

export interface InfData {
  includes: string[];
  sources: string[];
  packages: string[];
  pcds: string[];
  guids: DscGuid[];
  protocols: DscGuid[];
  infPath: Path;
  defines: Map<string, string>;
  components: string[];
  libraryClasses: DscLibClass[];
}

// DECs are a subset of INFs
export interface DecData {
  includes: string[];
  infPath: Path;
  defines: Map<string, string>;
  components: string[];
  libraryClasses: DscLibClass[];
  guids: DscGuid[];
  protocols: DscGuid[];
  pcds: string[];
}

// a reduced, simplified version of all the DSC data - all conditionals are evaluated removed so everything applies
// in case of conflicts, first evaluated is taken
export interface IDscData {
  filePath: Path;
  defines: Map<string, string>;
  libraries: DscLibClass[];
  components: DscComponent[];
  pcds: DscPcd[];
  //libraries: Map<string, Map<string, string>>; // arch -> library name -> library inf path
  //libraries: Map<string, [string, string][]>; // arch -> list of [library name, library inf path]
  //components: Map<string, string[]>; // arch -> component inf paths
  //pcds: Map<string, Map<string, string>>; // type of PCD -> name -> value
}

export interface IDscDataExtended {
  filePath: Uri;
  defines: DscDefines[],
  findDefine: (string)=>DscDefines[]; //search for a define by name
  libraries: DscLibClass[],
  pcds: DscPcd[],
  findPcd: (string)=>DscPcd[];
  toDscData: ()=>IDscData; //returns the DSC data in a simpler format
  symbols: DscSymbol[];
  errors: DscError[]
}

export class SourceInfo {
  uri: Uri;
  lineno: number;
  conditional?: DscConditional;
  column: number; //if we don't have a column or don't know, it's 0
  //TODO handle what type of section we are currently in? common, X64, DXE_DRIVER, etc
  //architectures?:
}

export class DscDefines {
  source: SourceInfo;
  key:string;
  value:string;
  toString: ()=>string // a function that returns a string
}

export class DscError{
  source: SourceInfo;
  code_text: string;
  error_msg: string;
  isFatal: Boolean;
  toString: ()=>string // a function that returns a string
}

export enum DscPcdType {
  FeatureFlag,
  FixedAtBuild,
  PatchableInModule,
  Dynamic,
  DynamicDefault,
  DynamicEx,
  DynamicExDefault,
  DynamicHii,
  DynamicExHii,
  DynamicVpd,
  DynamicExVpd,
  Unknown
}

export enum DscArch {
  X64,
  X84,
  ARM,
  AARCH64,
  EBC,
  COMMON,
  UNKNOWN
}

export enum DscSections {
  Defines,
  SkuIds,
  LibraryClasses,
  Components,
  BuildOptions,
  UserExtensions,
  DefaultStores
}

export class DscPcd {
  source: SourceInfo;
  tokenspace: string;
  tokenname: string;
  type:DscPcdType; //the type of PCD
  archs: DscArch[];
  id?:number;
  variableGuid?:string;
  toString: ()=>string // a function that returns a string
}
//the conditional
export class DscConditional {
  conditions: string[]; //a list of all the conditionals that took us to this point
  eval: Boolean; //the result of the evaluation
}

export class DscSymbol {
  source: SourceInfo;
  name: string;
  value: any
}

export class DscComponent {
  source: SourceInfo;
  infPath: Path;
  archs: DscArch[];
  libraryClasses?:DscLibClass[];
  defines?:DscDefines[];
  pcds?:DscPcd[];
  buildOptions?: InfBuildOption[];
  toString: ()=>string; // a function that returns a string
}

//TODO revisit this?
export class DscLibClass {
  source: SourceInfo;
  infPath: Path;
  archs: DscArch[];
  name: string;
  class: string;
  toString = ():string => {
    return this.class + "|" + this.infPath;
  }; // a function that returns a string
}

export class DscGuid {
  name: string;
  guid: string;
}


export class InfBuildOption {
  source: SourceInfo;
  compilerTarget: string; //MSFT, INTEL, GCC, LLVM, etc
  flagName: string; //*_*_*_CC_FLAGs=
  flagValue: string; //the value of the flag
  toString =  (): string => {
    return this.compilerTarget+":"+this.flagName+" = "+this.flagValue;
  }; // a function that returns a string
}