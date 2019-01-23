import { declare } from "@babel/helper-plugin-utils";
import syntaxPartialApplication from "@babel/plugin-syntax-partial-application";
import { types as t } from "@babel/core";

export default declare(api => {
  api.assertVersion(7);

  /**
   * a function to figure out if a call expression has
   * ArgumentPlaceholder as one of its arguments
   * @param node a callExpression node
   * @returns boolean
   */
  function hasArgumentPlaceholder(node) {
    for (let i = 0; i < node.arguments.length; i++) {
      if (t.isArgumentPlaceholder(node.arguments[i])) {
        return true;
      }
    }
    return false;
  }

  /**
   * Creates a unique identifier for the new returned function
   * @param {Object} scope
   * @returns {LVal} unique identifier
   */
  function newFuncLVal(scope) {
    return scope.generateUidIdentifier("_func");
  }

  /**
   * Creates a unique identifier for the parameters
   * @param {Object} scope
   * @returns {LVal} unique identifier
   */
  function newParamLVal(scope) {
    return scope.generateUidIdentifier("_param");
  }

  /**
   * Unwrap the arguments of a CallExpression and removes
   * ArgumentPlaceholders from the unwrapped arguments
   * @param {Object} node CallExpression node
   * @returns {Array<Expression>}
   */
  function unwrapArguments(node) {
    const nonPlaceholder = node.arguments.filter(
      argument => argument.type !== "ArgumentPlaceholder",
    );
    return nonPlaceholder;
  }

  /**
   * Unwraps all of the arguments in CallExpression
   * and removes ArgumentPlaceholders type with Identifier
   * and gives them a uniques name.
   * @param {Object} node
   * @param {Object} scope
   * @returns {Array<Expression>} the arguments
   */
  function unwrapAllArguments(node, scope) {
    const clone = t.cloneNode(node);
    clone.arguments.forEach(argument => {
      if (argument.type === "ArgumentPlaceholder") {
        argument.type = "Identifier";
        argument.name = scope.generateUid("_argPlaceholder");
      }
    });
    return clone.arguments;
  }

  /**
   * Makes an array of declarator for our VariableDeclaration
   * @param {Array<Expression>} inits
   * @param {Object} scope
   */
  function argsToVarDeclarator(inits, scope) {
    let declarator = [];
    declarator = inits.map(expr =>
      t.variableDeclarator(newParamLVal(scope), expr),
    );
    return declarator;
  }

  /**
   * It replaces the values of non-placeholder args in allArgs
   * @param {Array<Declarator>} nonPlaceholderDecl that has no placeholder in them
   * @param {Array<Arguments>} args
   */
  function mapNonPlaceholderToLVal(nonPlaceholderDecl, allArgsList) {
    const clone = Array.from(allArgsList);
    clone.forEach(cl => {
      nonPlaceholderDecl.forEach(dec => {
        if (dec.init.type === cl.type) {
          if (!!cl.value && cl.value === dec.init.value) {
            cl.value = dec.id.name;
          } else if (!!cl.name && cl.name === dec.init.name) {
            cl.name = dec.id.name;
          }
        }
      });
    });
    return clone;
  }

  /**
   * Takes the full list of arguments and extracts placeholders from it
   * @param {Array<Argument>} allArgsList full list of arguments
   * @returns {Array<ArgumentPlaceholder>} cloneList
   */
  function placeholderLVal(scope, allArgsList) {
    let cloneList = [];
    allArgsList.forEach(item => {
      if (item.name && item.name.includes("_argPlaceholder")) {
        cloneList = cloneList.concat(item);
      }
    });
    return cloneList;
  }

  return {
    name: "proposal-partial-application",
    inherits: syntaxPartialApplication,

    visitor: {
      CallExpression(path) {
        if (!hasArgumentPlaceholder(path.node)) {
          return;
        }
        const { node, scope } = path;
        const functionLVal = newFuncLVal(scope);
        const nonPlaceholderArgs = unwrapArguments(node);
        const nonPlaceholderDecl = argsToVarDeclarator(
          nonPlaceholderArgs,
          scope,
        );
        const allArgs = unwrapAllArguments(node, scope);
        const finalArgs = mapNonPlaceholderToLVal(nonPlaceholderDecl, allArgs);
        const placeholderVals = placeholderLVal(scope, allArgs);
        const finalExpression = t.callExpression(
          t.arrowFunctionExpression(
            [],
            t.blockStatement(
              [
                t.variableDeclaration("const", [
                  t.variableDeclarator(
                    functionLVal,
                    t.identifier(node.callee.name),
                  ),
                ]),
                t.variableDeclaration("const", nonPlaceholderDecl),
                t.returnStatement(
                  t.arrowFunctionExpression(
                    placeholderVals,
                    t.callExpression(functionLVal, finalArgs),
                    false,
                  ),
                ),
              ],
              [],
            ),
            false,
          ),
          [],
        );

        path.replaceWith(finalExpression);
      },
    },
  };
});
