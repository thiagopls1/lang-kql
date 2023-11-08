import {continuedIndent, indentNodeProp, foldNodeProp, LRLanguage, LanguageSupport} from "@codemirror/language"
import {Extension} from "@codemirror/state"
import {Completion, CompletionSource} from "@codemirror/autocomplete"
import {styleTags, tags as t} from "@lezer/highlight"
import {parser as baseParser} from "./kql.grammar"
import {tokens, Dialect, tokensFor, KQLKeywords, KQLTypes, dialect} from "./tokens"
import {completeFromSchema, completeKeywords} from "./complete"

let parser = baseParser.configure({
  props: [
    indentNodeProp.add({
      Statement: continuedIndent()
    }),
    foldNodeProp.add({
      Statement(tree) { return {from: tree.firstChild!.to, to: tree.to} },
      BlockComment(tree) { return {from: tree.from + 2, to: tree.to - 2} }
    }),
    styleTags({
      Keyword: t.keyword,
      Type: t.typeName,
      Builtin: t.standard(t.name),
      Bits: t.number,
      Bytes: t.string,
      Bool: t.bool,
      Null: t.null,
      Number: t.number,
      String: t.string,
      Identifier: t.name,
      QuotedIdentifier: t.special(t.string),
      SpecialVar: t.special(t.name),
      LineComment: t.lineComment,
      BlockComment: t.blockComment,
      Operator: t.operator,
      "Semi Punctuation": t.punctuation,
      "( )": t.paren,
      "{ }": t.brace,
      "[ ]": t.squareBracket
    })
  ]
})

/// Configuration for an [KQL Dialect](#lang-kql.KQLDialect).
export type KQLDialectSpec = {
  /// A space-separated list of keywords for the dialect.
  keywords?: string,
  /// A space-separated string of built-in identifiers for the dialect.
  builtin?: string,
  /// A space-separated string of type names for the dialect.
  types?: string,
  /// Controls whether regular strings allow backslash escapes.
  backslashEscapes?: boolean,
  /// Controls whether # creates a line comment.
  hashComments?: boolean,
  /// Controls whether `//` creates a line comment.
  slashComments?: boolean,
  /// When enabled `--` comments are only recognized when there's a
  /// space after the dashes.
  spaceAfterDashes?: boolean,
  /// When enabled, things quoted with "$$" are treated as
  /// strings, rather than identifiers.
  doubleDollarQuotedStrings?: boolean,
  /// When enabled, things quoted with double quotes are treated as
  /// strings, rather than identifiers.
  doubleQuotedStrings?: boolean,
  /// Enables strings like `_utf8'str'` or `N'str'`.
  charSetCasts?: boolean,
  /// Enables string quoting syntax like `q'[str]'`, as used in
  /// PL/KQL.
  plkqlQuotingMechanism?: boolean,
  /// The set of characters that make up operators. Defaults to
  /// `"*+\-%<>!=&|~^/"`.
  operatorChars?: string,
  /// The set of characters that start a special variable name.
  /// Defaults to `"?"`.
  specialVar?: string,
  /// The characters that can be used to quote identifiers. Defaults
  /// to `"\""`.
  identifierQuotes?: string
  /// Controls whether bit values can be defined as 0b1010. Defaults
  /// to false.
  unquotedBitLiterals?: boolean,
  /// Controls whether bit values can contain other characters than 0 and 1.
  /// Defaults to false.
  treatBitsAsBytes?: boolean,
}

/// Represents an KQL dialect.
export class KQLDialect {
  private constructor(
    /// @internal
    readonly dialect: Dialect,
    /// The language for this dialect.
    readonly language: LRLanguage,
    /// The spec used to define this dialect.
    readonly spec: KQLDialectSpec
  ) {}

  /// Returns the language for this dialect as an extension.
  get extension() { return this.language.extension }

  /// Define a new dialect.
  static define(spec: KQLDialectSpec) {
    let d = dialect(spec, spec.keywords, spec.types, spec.builtin)
    let language = LRLanguage.define({
      name: "kql",
      parser: parser.configure({
        tokenizers: [{from: tokens, to: tokensFor(d)}]
      }),
      languageData: {
        commentTokens: {line: "//"},
        closeBrackets: {brackets: ["(", "[", "{", "'", '"', "`"]}
      }
    })
    return new KQLDialect(d, language, spec)
  }
}

/// Options used to configure an KQL extension.
export interface KQLConfig {
  /// The [dialect](#lang-kql.KQLDialect) to use. Defaults to
  /// [`StandardKQL`](#lang-kql.StandardKQL).
  dialect?: KQLDialect,
  /// An object that maps table names, optionally prefixed with a
  /// schema name (`"schema.table"`) to options (columns) that can be
  /// completed for that table. Use lower-case names here.
  schema?: {[table: string]: readonly (string | Completion)[]},
  /// By default, the completions for the table names will be
  /// generated from the `schema` object. But if you want to
  /// customize them, you can pass an array of completions through
  /// this option.
  tables?: readonly Completion[],
  /// Similar to `tables`, if you want to provide completion objects
  /// for your schemas rather than using the generated ones, pass them
  /// here.
  schemas?: readonly Completion[],
  /// When given, columns from the named table can be completed
  /// directly at the top level.
  defaultTable?: string,
  /// When given, tables prefixed with this schema name can be
  /// completed directly at the top level.
  defaultSchema?: string,
  /// When set to true, keyword completions will be upper-case.
  upperCaseKeywords?: boolean
}

/// Returns a completion source that provides keyword completion for
/// the given KQL dialect.
export function keywordCompletionSource(dialect: KQLDialect, upperCase = false): CompletionSource {
  return completeKeywords(dialect.dialect.words, upperCase)
}

/// FIXME remove on 1.0 @internal
export function keywordCompletion(dialect: KQLDialect, upperCase = false): Extension {
  return dialect.language.data.of({
    autocomplete: keywordCompletionSource(dialect, upperCase)
  })
}

/// Returns a completion sources that provides schema-based completion
/// for the given configuration.
export function schemaCompletionSource(config: KQLConfig): CompletionSource {
  return config.schema ? completeFromSchema(config.schema, config.tables, config.schemas,
                                            config.defaultTable, config.defaultSchema,
                                            config.dialect || StandardKQL)
    : () => null
}

/// FIXME remove on 1.0 @internal
export function schemaCompletion(config: KQLConfig): Extension {
  return config.schema ? (config.dialect || StandardKQL).language.data.of({
    autocomplete: schemaCompletionSource(config)
  }) : []
}

/// KQL language support for the given KQL dialect, with keyword
/// completion, and, if provided, schema-based completion as extra
/// extensions.
export function kql(config: KQLConfig = {}) {
  let lang = config.dialect || StandardKQL
  return new LanguageSupport(lang.language, [schemaCompletion(config), keywordCompletion(lang, !!config.upperCaseKeywords)])
}

/// The standard KQL dialect.
export const StandardKQL = KQLDialect.define({})