# coding=utf-8
import docker
import pytest
import time

testinfra_hosts = ['docker://test_container']


@pytest.fixture(scope="module", autouse=True)
def container(client, image):
  container = client.containers.run(
      image.id,
      name="test_container",
      volumes={
        'missing_data': {'bind': '/opt/solid/data'},
        'missing_db': {'bind': '/opt/solid/.db'},
        'missing_config': {'bind': '/opt/solid/config'}
      },
      environment=[
        "SOLID_SSL_KEY=/missing/key",
        "SOLID_SSL_CERT=/missing/cert"
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
  assert "✗ /opt/solid/config not writable by node" in logs
  assert "✗ /opt/solid/data not writable by node" in logs
  assert "✗ /opt/solid/.db not writable by node" in logs
  assert "✗ /missing/key does not exist" in logs
  assert "✗ /missing/cert does not exist" in logs
  assert "Finished: ERROR" in logs
  assert not "Finished: SUCCESS" in logs
