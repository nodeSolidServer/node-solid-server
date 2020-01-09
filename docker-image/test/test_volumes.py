import docker
import pytest
import time

testinfra_hosts = ['docker://test_container']

@pytest.fixture(scope="module", autouse=True)
def solid_server(client, image):
  container = client.containers.run(
      image.id,
      name="solid_server",
      detach=True,
      tty=True
  )
  # give the solid process some seconds to create the directory structure before making assertions
  time.sleep(2)
  yield container
  container.remove(force=True)

@pytest.fixture(scope="module", autouse=True)
def container(client, solid_server):
  container = client.containers.run(
      'alpine',
      name="test_container",
      detach=True,
      tty=True,
      volumes_from=solid_server.id
  )
  # give the solid process some seconds to create the directory structure before making assertions
  time.sleep(2)
  yield container
  container.remove(force=True)

def test_solid_data_dir_is_mounted(host):
  solid_data = host.file("/opt/solid/data/")
  assert solid_data.exists
  assert solid_data.is_directory
  assert solid_data.uid == 1000
  assert solid_data.gid == 1000

def test_solid_db_dir_is_mounted(host):
  solid_db = host.file("/opt/solid/.db/")
  assert solid_db.exists
  assert solid_db.is_directory
  assert solid_db.uid == 1000
  assert solid_db.gid == 1000

def test_solid_config_dir_is_mounted(host):
  solid_config = host.file("/opt/solid/config/")
  assert solid_config.exists
  assert solid_config.is_directory
  assert solid_config.uid == 1000
  assert solid_config.gid == 1000
