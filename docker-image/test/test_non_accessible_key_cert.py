# coding=utf-8
import docker
import pytest
import time

import os

testinfra_hosts = ['docker://test_container']


@pytest.fixture(scope="module", autouse=True)
def container(client, image):
  container = client.containers.run(
      image.id,
      name="test_container",
      environment=[
        # just using to files that exist but are not readable by node
        "SOLID_SSL_KEY=/root",
        "SOLID_SSL_CERT=/etc/shadow"
      ],
      detach=True,
      tty=True
  )
  # give the solid process some seconds to create the directory structure before making assertions
  time.sleep(2)
  yield container
  container.remove(force=True)


def test_container_fails_with_errors(container):
  assert container.status == "created"
  logs = container.logs()
  assert "✗ /root not readable by node" in logs
  assert "✗ /etc/shadow not readable by node" in logs
  assert "Finished: ERROR" in logs
  assert not "Finished: SUCCESS" in logs
