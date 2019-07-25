import { Uri } from "vscode";
import { Path } from "../utilities";

export interface InfData {
  includes: string[];
  sources: string[];
  packages: string[];
  pcds: string[];
  guids: IDscGuid[];
  protocols: IDscGuid[];
  infPath: Path;
  defines: Map<string, string>;
  components: string[];
  libraryClasses: IDscLibClass[];
}

// DECs are a subset of INFs
export interface DecData {
  includes: string[];
  infPath: Path;
  defines: Map<string, string>;
  components: string[];
  libraryClasses: IDscLibClass[];
  guids: IDscGuid[];
  protocols: IDscGuid[];
  pcds: string[];
}

// a reduced, simplified version of all the DSC data - all conditionals are evaluated removed so everything applies
// in case of conflicts, first evaluated is taken
export interface IDscData {
  filePath: Path;
  defines: Map<string, string>;
  libraries: IDscLibClass[];
  components: IComponent[];
  pcds: IDscPcd[];
  //libraries: Map<String, Map<String, String>>; // arch -> library name -> library inf path
  //libraries: Map<String, [String, String][]>; // arch -> list of [library name, library inf path]
  //components: Map<String, String[]>; // arch -> component inf paths
  //pcds: Map<String, Map<String, String>>; // type of PCD -> name -> value
}

export interface IDscDataExtended {
  filePath: Uri;
  defines: IDscDefines[],
  findDefine: (String)=>IDscDefines[]; //search for a define by name
  libraries: IDscLibClass[],
  pcds: IDscPcd[],
  findPcd: (String)=>IDscPcd[];
  toDscData: ()=>IDscData; //returns the DSC data in a simpler format
  errors: IDscError[]
}

export interface ISourceInfo {
  uri: Uri;
  lineno: Number;
  conditional?: IDscConditional;
  column: Number; //if we don't have a column or don't know, it's 0
}

export interface IDscDefines {
  source: ISourceInfo;
  key:String;
  value:String;
  toString: ()=>String // a function that returns a string
}

export interface IDscError{
  source: ISourceInfo;
  text: String;
  error_msg: String;
  isFatal: Boolean;
  toString: ()=>String // a function that returns a string
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

export interface IDscPcd {
  source: ISourceInfo;
  tokenspace: String;
  tokenname: String;
  type:DscPcdType; //the type of PCD
  archs: DscArch[];
  id?:Number;
  variableGuid?:String;
  toString: ()=>String // a function that returns a string
}
//the conditional
export interface IDscConditional {
  conditions: String[]; //a list of all the conditionals that took us to this point
  eval: Boolean; //the result of the evaluation
}

export interface IComponent {
  source: ISourceInfo;
  infPath: Path;
  archs: DscArch[];
  libraryClasses?:IDscLibClass[];
  toString: ()=>String; // a function that returns a string
}

export interface IDscLibClass {
  source: ISourceInfo;
  infPath: Path;
  archs: DscArch[];
  name: String;
  class: String;
  toString: ()=>String; // a function that returns a string
  //BuildOptions: DscBuildOption[];
}

export interface IDscGuid {
  name: string;
  guid: string;
}