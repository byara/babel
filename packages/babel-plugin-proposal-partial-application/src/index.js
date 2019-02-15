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
    return node.arguments.some(arg => t.isArgumentPlaceholder(arg));
  }

  /**
   * Unwrap the arguments of a CallExpression, and creates
   * assignmentExpression from them and returns them as an array.
   * @param {Object} node CallExpression node
   * @returns {Array<AssignmentExpression>}
   */
  function unwrapArguments(node, scope) {
    let newNode;
    let argId;
    return node.arguments.reduce((acc, arg) => {
      if (!t.isArgumentPlaceholder(arg) && !t.isNumericLiteral(arg)) {
        argId = scope.generateUidIdentifier("_param");
        scope.push({ id: argId });
        newNode = t.assignmentExpression("=", t.cloneNode(argId), arg);
        acc.push(newNode);
      }
      return acc;
    }, []);
  }

  /**
   * Unwraps all of the arguments in a CallExpression
   * and replaces ArgumentPlaceholder type with Identifier
   * and gives them a unique name.
   * @param {Object} node
   * @param {Object} scope
   * @returns {Array<Expression>} the arguments
   */
  function unwrapAllArguments(node, scope) {
    const clone = t.cloneNode(node);

    return clone.arguments.map(arg => {
      if (t.isArgumentPlaceholder(arg)) {
        return Object.assign({}, arg, {
          type: "Identifier",
          name: scope.generateUid("_argPlaceholder"),
        });
      }
      return arg;
    });
  }

  /**
   * It replaces the values of non-placeholder args in allArgs
   * @param {Array<Node>} nonPlaceholderArgs that has no placeholder in them
   * @param {Array<Node>} args
   */
  function mapNonPlaceholderToLVal(nonPlaceholderArgs, allArgsList) {
    const clonedArgs = Array.from(allArgsList);
    clonedArgs.map(arg => {
      nonPlaceholderArgs.forEach(pArg => {
        if (!t.isNumericLiteral(arg) && pArg.right.name === arg.name) {
          arg.name = pArg.left.name;
        }
      });
    });
    return clonedArgs;
  }

  /**
   * Takes the full list of arguments and extracts placeholders from it
   * @param {Array<Argument>} allArgsList full list of arguments
   * @returns {Array<ArgumentPlaceholder>} cloneList
   */
  function placeholderLVal(allArgsList) {
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
        const functionLVal = path.scope.generateUidIdentifierBasedOnNode(
          node.callee,
        );
        const receiverLVal = path.scope.generateUidIdentifierBasedOnNode(
          node.callee.object,
        );
        const nonPlaceholderArgs = unwrapArguments(node, scope);
        const allArgs = unwrapAllArguments(node, scope);
        const finalArgs = mapNonPlaceholderToLVal(nonPlaceholderArgs, allArgs);
        const placeholderVals = placeholderLVal(allArgs);

        scope.push({ id: receiverLVal });
        scope.push({ id: functionLVal });

        if (node.callee.type === "MemberExpression") {
          const finalExpression = t.sequenceExpression([
            t.assignmentExpression(
              "=",
              t.cloneNode(receiverLVal),
              node.callee.object,
            ),
            t.assignmentExpression(
              "=",
              t.cloneNode(functionLVal),
              t.memberExpression(
                receiverLVal,
                node.callee.property,
                false,
                false,
              ),
            ),
            ...nonPlaceholderArgs,
            t.functionExpression(
              node.callee.property,
              placeholderVals,
              t.blockStatement(
                [
                  t.returnStatement(
                    t.callExpression(
                      t.memberExpression(
                        functionLVal,
                        t.identifier("call"),
                        false,
                        false,
                      ),
                      [receiverLVal, ...finalArgs],
                    ),
                  ),
                ],
                [],
              ),
              false,
              false,
            ),
          ]);
          path.replaceWith(finalExpression);
        } else {
          const finalExpression = t.sequenceExpression([
            t.assignmentExpression("=", t.cloneNode(functionLVal), node.callee),
            ...nonPlaceholderArgs,
            t.functionExpression(
              node.callee,
              placeholderVals,
              t.blockStatement(
                [t.returnStatement(t.callExpression(functionLVal, finalArgs))],
                [],
              ),
              false,
              false,
            ),
          ]);
          path.replaceWith(finalExpression);
        }
      },
    },
  };
});
