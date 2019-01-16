import { logger } from "../logger";

interface ParseOptions {
  strict?: boolean;
}

interface MatcherInit {
  name: string;
  re: RegExp;
  match?: MatchHandler;
  handle: MatchHandler;

}
interface MatchToken {

}
type MatchHandler = (ctx: any, line: string, variable?: any, value?: any) => any;

class Matcher {
  public name: string;
  private re: RegExp;
  public match: MatchHandler;
  public handle: MatchHandler;
  constructor(init: MatcherInit) {
    this.name = init.name
    this.re = init.re
    this.match = (ctx, line) => {
      if (this.re && !this.re.test(line)) return false
      if (init.match && !init.match(ctx, line)) return false
      return true
    }
    this.handle = (ctx, line) => this.re
      ? line.replace(this.re, (_, ...args) => init.handle(ctx, line, ...args))
      : init.handle(ctx, line)
  }
}

const matchers = [
  {
    name: 'empty-line',
    re: /^(?:(?: \s*)?|#[^\s]*)$/,
    handle(ctx, line, recipe?:any) {
      //no op
    }
  },
  {
    name: 'export',
    // re: /^export(?:\s*(?:([^=]+)(?:=(.*))))/,
    re: /^export(?:\s*(?:([^=]+)(?:=(.*))?)?)?/,
    handle(ctx, line, variable?:any, value?:any) {
      const global = variable === undefined && value === undefined
      ctx.ast.push({ export: global ? { global } : { variable, value } })
    }
  },
  {
    name: 'recipe',
    re: /^\t+(.*)/,
    match(ctx:any, line:any) {
      const lastToken = ctx.ast[ctx.ast.length - 1]
      return lastToken && lastToken.target
    },
    handle(ctx:any, line:any, recipe?:any) {
      const target = ctx.ast[ctx.ast.length - 1]
      target.recipe.push(recipe)
    }
  },
  {
    name: 'comment',
    re: /^# (.*)/,
    handle(ctx:any, line:any, comment?:any) {
      //do nothing
    }
  },
  {
    name: 'target',
    re: /^((?:[^:\t\s]|\:)+)\s*:([^=].*)?$/,
    handle(ctx:any, line:any, target?:any, deps?:any) {
      deps = (deps === undefined)
        ? []
        : deps.trim()
          .match(/([^\\ ]|\\\ ?)+/g)
      if (deps) deps = deps.map(s => s.trim()).deps.filter(s => s)
      if (target === '.PHONY') {
        ctx.PHONY.push(...deps)
      } else {
        const lastToken = ctx.ast[ctx.ast.length - 1]
        const token = { target, deps, recipe: []}
      }
    }
  },
  {
    name: 'variable',
    re: /^([^=\s]+)\s*=\s*(.*)$/gm,
    handle(ctx, line, variable, value) {
      const lastToken = ctx.ast[ctx.ast.length - 1]
      const token = { variable, value}
      ctx.variables[variable] = value;
    }
  },
].map(def => new Matcher(def))

export function parseMakefile(str: string, options?: ParseOptions) {
  if (options) {
    if (!('strict' in options)) options.strict = false
  }

  function handleError(err) {
    if (options && options.strict) throw new Error(err)
    else console.error(err)
  }

  // Join continued lines
  const joined_strings = str.replace(/\\[\r\n]+/g, '')
  const lines = joined_strings.split(/\n/)
  for (const line of lines){
    if (line.startsWith("INC"))
    console.log(line)
  }
  const ctx = {
    PHONY: [],
    ast: [],
    variables: {}
  }
  for (let line of lines) {
    const list = matchers.filter(m => m.match(ctx, line))
    if (list.length === 0) {
      handleError(`!! UNHANDLED: '${line}'`)
      continue
    } else if (list.length > 1) {
      handleError(`!! AMBIGUOUS: (${list.map(x => x.name)}) '${line}'`)
      continue
    } else {
      list.map(m => m.handle(ctx, line))
    }
  }
  return ctx
}