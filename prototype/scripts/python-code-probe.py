"""Offline probe runner. Docker supplies the isolation boundary, not exec()."""
import ast
import contextlib
import json
import re
import signal
import sys


class QuietOutput:
    def write(self, text):
        return len(text)

    def flush(self):
        pass


def timed_out(_signal, _frame):
    raise TimeoutError("Python public assertion exceeded two seconds")


def equivalent(actual, expected):
    if isinstance(actual, bool) or isinstance(expected, bool):
        return type(actual) is type(expected) and actual == expected
    if isinstance(actual, (int, float)) and isinstance(expected, (int, float)):
        return actual == expected
    if isinstance(actual, dict) and isinstance(expected, dict):
        return actual.keys() == expected.keys() and all(equivalent(actual[key], expected[key]) for key in actual)
    if isinstance(actual, list) and isinstance(expected, list):
        return len(actual) == len(expected) and all(equivalent(left, right) for left, right in zip(actual, expected))
    return type(actual) is type(expected) and actual == expected


def main():
    raw = sys.stdin.buffer.read(131073)
    if len(raw) > 131072:
        raise ValueError("Bounded public probe input exceeded")
    request = json.loads(raw)
    try:
        tree = ast.parse(request["code"], filename="public-case.py", mode="exec")
        compiled = compile(tree, "public-case.py", "exec")
    except (SyntaxError, ValueError) as error:
        return {"passed": False, "results": [{"label": "Python compilation", "passed": False, "error": str(error)[:500]}]}
    if request.get("compileOnly"):
        return {"passed": True, "results": [{"label": "Python compilation", "passed": True}]}
    name = request.get("functionName", "")
    tests = request.get("tests")
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name) or not isinstance(tests, list) or not 3 <= len(tests) <= 8:
        raise ValueError("Invalid public Python probe")
    if not any(isinstance(node, ast.FunctionDef) and node.name == name for node in tree.body):
        raise ValueError("Selected standalone public function is not supplied")
    signal.signal(signal.SIGALRM, timed_out)
    results = []
    for test in tests:
        actual = None
        error = None
        scope = {"__name__": "public_code_probe"}
        try:
            signal.alarm(2)
            with contextlib.redirect_stdout(QuietOutput()), contextlib.redirect_stderr(QuietOutput()):
                exec(compiled, scope)
                actual = scope[name](*test["args"])
            # JSON serialisation verifies that the return value fits the public contract.
            actual = json.loads(json.dumps(actual, allow_nan=False))
        except BaseException as failure:
            error = str(failure)[:500] or type(failure).__name__
        finally:
            signal.alarm(0)
        expected_error = isinstance(test.get("errorContains"), str) or test.get("errorExpected") is True
        # JSON numbers share a numeric contract. Booleans and record order remain distinct.
        passed = bool(error and (test.get("errorExpected") is True or test["errorContains"] in error)) if expected_error else error is None and equivalent(actual, test.get("expected"))
        expectation = {"errorExpected": True} if test.get("errorExpected") is True else {"errorContains": test["errorContains"]} if expected_error else {"expected": test.get("expected")}
        results.append({"label": test["label"], "passed": passed, **({"error": error} if error else {"actual": actual}), **expectation})
    return {"passed": all(result["passed"] for result in results), "results": results}


try:
    sys.stdout.write(json.dumps(main(), allow_nan=False))
except BaseException as failure:
    sys.stdout.write(json.dumps({"error": str(failure)[:500] or type(failure).__name__}))
    sys.exit(1)
