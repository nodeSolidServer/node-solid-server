import time

def wait_for_container(container, message="running on"):
    count = 0
    while (not message in container.logs()) and (count < 10):
        count = count + 1
        time.sleep(1)
    assert message in container.logs(), 'Expected message not present until timeout. Waited for "%s"' % message
