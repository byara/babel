import { declare } from "@babel/helper-plugin-utils";
import syntaxPartialApplication from "@babel/plugin-syntax-partial-application";
import { types as t } from "@babel/core";

export default declare(api => {
  api.assertVersion(7);

  let orderedArguments = [];
  let nonPlaceholders = [];
  let placeholders = [];
  let blockStatementBody = [];

  /**
   * creates an array of VariableDeclarators
   * @param node to get the names from it
   * @todo deal with the acceptance of strings and not numbers
   */
  function declaratorCreator(node) {
    blockStatementBody = blockStatementBody.concat(
      t.variableDeclarator(
        t.identifier(`_func0`),
        t.identifier(node.callee.name),
      ),
    );
    for (let i = 0; i < nonPlaceholders.length; i++) {
      blockStatementBody = blockStatementBody.concat(
        t.variableDeclarator(
          t.identifier(`_param${i}`),
          t.identifier(`${nonPlaceholders[i]}`),
        ),
      );
    }
  }

  /**
   * gets all Arguments and puts them in appropriate array
   * @param node
   * @todo find a way to NOT use a global variable for the arguments
   */
  function unfoldArguments(node) {
    for (let i = 0; i < node.arguments.length; i++) {
      if (t.isArgumentPlaceholder(node.arguments[i])) {
        placeholders = placeholders.concat(t.identifier(`_argPlaceholder${i}`));
        orderedArguments = orderedArguments.concat(
          t.identifier(`_argPlaceholder${i}`),
        );
      } else if (t.isIdentifier(node.arguments[i])) {
        nonPlaceholders = nonPlaceholders.concat(node.arguments[i].name);
        orderedArguments = orderedArguments.concat(t.identifier(`_param${i}`));
      } else {
        nonPlaceholders = nonPlaceholders.concat(node.arguments[i].value);
        orderedArguments = orderedArguments.concat(t.identifier(`_param${i}`));
      }
    }
  }

  return {
    name: "proposal-partial-application",
    inherits: syntaxPartialApplication,

    visitor: {
      CallExpression(path) {
        const { node } = path;
        // create arrays of arguments
        unfoldArguments(node);
        // create an array of declarator
        declaratorCreator(node);

        /**
         * we need a BlockStatement to put all the statements in it
         * @param body Array<Statement>
         * @param directives Array<Directive> (default: null)
         * @todo maybe not use spread operator
         */
        const newBlockStatement = t.blockStatement([
          t.variableDeclaration("const", blockStatementBody),

          t.returnStatement(
            t.arrowFunctionExpression(
              placeholders,
              t.callExpression(t.identifier(`XXXX`), orderedArguments),
              false,
            ),
          ),
        ]);

        /**
         * we create an ArrowFunctionExpression
         * @param params Array<LVal>
         * @param body BlockStatement | Expression
         * @param async boolean
         */

        const outerArrowFunction = t.parenthesizedExpression(
          t.arrowFunctionExpression([], newBlockStatement, false),
        );

        /**
         * here we create a call expression out of the arrow function
         */
        // const outerCallExpression = t.callExpression(outerArrowFunction, []);

        path.replaceWith(outerArrowFunction);
      },
    },
  };
});
