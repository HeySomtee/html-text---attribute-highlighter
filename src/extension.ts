import * as vscode from "vscode";
import { getLanguageService, TokenType } from "vscode-html-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";

export function activate(context: vscode.ExtensionContext) {
  let highlightInnerText = vscode.commands.registerCommand(
    "html-innertext-highlighter.highlightInnerText",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const document = editor.document;
        const cursorPosition = editor.selection.active;

        const htmlLanguageService = getLanguageService();

        // Convert VSCode TextDocument to LSP TextDocument
        const lspDocument = TextDocument.create(
          document.uri.toString(),
          document.languageId,
          document.version,
          document.getText()
        );

        const offset = lspDocument.offsetAt(cursorPosition);
        const htmlDocument = htmlLanguageService.parseHTMLDocument(lspDocument);
        const scanner = htmlLanguageService.createScanner(lspDocument.getText());

        let token = scanner.scan();
        let startTagOffset: number | undefined = undefined;
        let endTagOffset: number | undefined = undefined;
        let tagStack: { tag: string; offset: number }[] = [];

        while (token !== TokenType.EOS) {
          if (token === TokenType.StartTag) {
            const tagName = scanner.getTokenText();
            tagStack.push({ tag: tagName, offset: scanner.getTokenOffset() });
          } else if (token === TokenType.EndTag) {
            const tagName = scanner.getTokenText();
            while (tagStack.length > 0) {
              const lastTag = tagStack.pop();
              if (lastTag && lastTag.tag === tagName) {
                if (lastTag.offset <= offset && scanner.getTokenEnd() >= offset) {
                  startTagOffset = lastTag.offset;
                  endTagOffset = scanner.getTokenEnd();
                  break;
                }
              }
            }
          }
          token = scanner.scan();
        }

        if (startTagOffset !== undefined && endTagOffset !== undefined) {
          // Ensure we are inside the tag boundaries
          const startTagEndOffset = document.getText().indexOf('>', startTagOffset) + 1;
          const endTagStartOffset = document.getText().lastIndexOf('<', endTagOffset);

          let startPosition = document.positionAt(startTagEndOffset);
          let endPosition = document.positionAt(endTagStartOffset);

          // Adjust to select inner text only
          const selectedText = document.getText(new vscode.Range(startPosition, endPosition));

          // Regex to capture inner text excluding tags
          const innerTextMatch = selectedText.match(/>([^<]*)</);

          if (innerTextMatch && innerTextMatch[1]) {
            const innerTextStartOffset = startTagEndOffset + selectedText.indexOf(innerTextMatch[1]);
            const innerTextEndOffset = innerTextStartOffset + innerTextMatch[1].length;

            startPosition = document.positionAt(innerTextStartOffset);
            endPosition = document.positionAt(innerTextEndOffset);
          }

          const selection = new vscode.Selection(startPosition, endPosition);
          editor.selection = selection;
          await vscode.commands.executeCommand(
            "editor.action.clipboardCopyAction"
          );
        } else {
          vscode.window.showInformationMessage("No innerText found within current tag.");
        }
      }
    }
  );

  let highlightAttributeValue = vscode.commands.registerCommand(
    "html-innertext-highlighter.highlightAttributeValue",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const document = editor.document;
        const cursorPosition = editor.selection.active;
        const text = document.getText();

        const offset = document.offsetAt(cursorPosition);

        // Regex for HTML attribute values
        const attrRegex = /(\w+)\s*=\s*["'][^"']*["']/g;
        let attrMatch: RegExpExecArray | null;
        let attrStart: number | undefined = undefined;
        let attrEnd: number | undefined = undefined;

        while ((attrMatch = attrRegex.exec(text)) !== null) {
          const matchStart = attrMatch.index;
          const matchEnd = attrRegex.lastIndex;

          if (matchStart <= offset && offset <= matchEnd) {
            attrStart = text.indexOf('"', matchStart) + 1;
            attrEnd = text.indexOf('"', attrStart);
            if (attrEnd === -1) {
              attrStart = text.indexOf("'", matchStart) + 1;
              attrEnd = text.indexOf("'", attrStart);
            }
            break;
          }
        }

        // Regex for string literals
        const stringRegex = /(["'])(?:(?=(\\?))\2.)*?\1/g;
        let strMatch: RegExpExecArray | null;
        let strStart: number | undefined = undefined;
        let strEnd: number | undefined = undefined;

        while ((strMatch = stringRegex.exec(text)) !== null) {
          const matchStart = strMatch.index;
          const matchEnd = stringRegex.lastIndex;

          if (matchStart <= offset && offset <= matchEnd) {
            strStart = matchStart + 1;
            strEnd = matchEnd - 1;
            break;
          }
        }

        // Determine which match to use (prefer attribute value if both match)
        let startPosition: vscode.Position | undefined;
        let endPosition: vscode.Position | undefined;

        if (attrStart !== undefined && attrEnd !== undefined) {
          startPosition = document.positionAt(attrStart);
          endPosition = document.positionAt(attrEnd);
        } else if (strStart !== undefined && strEnd !== undefined) {
          startPosition = document.positionAt(strStart);
          endPosition = document.positionAt(strEnd);
        }

        if (startPosition && endPosition) {
          const selection = new vscode.Selection(startPosition, endPosition);
          editor.selection = selection;
          await vscode.commands.executeCommand(
            "editor.action.clipboardCopyAction"
          );
        } else {
          vscode.window.showInformationMessage("No attribute value or string literal found at cursor position.");
        }
      }
    }
  );

  context.subscriptions.push(highlightInnerText);
  context.subscriptions.push(highlightAttributeValue);
}

export function deactivate() {}
